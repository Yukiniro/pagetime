import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Chrome's action popup is a page target, but Playwright's auto-attach never adopts it.
// Drive that target through its own DevTools socket.
export async function attachPopup(debugPort) {
  let target;
  await expect.poll(async () => {
    const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
    target = list.find(item => item.type === 'page' && item.url.endsWith('/popup.html'));
    return Boolean(target?.webSocketDebuggerUrl);
  }).toBe(true);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const done = pending.get(message.id);
    if (!done) return;
    pending.delete(message.id);
    done(message);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'popup evaluate failed');
    return result.result.value;
  };

  return {
    evaluate,
    async snap() {
      return evaluate(`(() => {
        const labelOf = el => {
          const labelled = el.getAttribute('aria-labelledby');
          const fromIds = labelled ? labelled.split(/\\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ') : '';
          return (el.getAttribute('aria-label') || fromIds || el.innerText || '').replace(/\\s+/g, ' ').trim();
        };
        const roleOf = el => el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : el.tagName === 'H1' ? 'heading' : el.tagName.toLowerCase());
        const nodes = [...document.querySelectorAll('button, h1, [role]')].map(el => ({
          role: roleOf(el),
          name: labelOf(el),
          tag: el.tagName,
          disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
          checked: el.getAttribute('aria-checked'),
        }));
        const main = document.querySelector('main');
        const figure = document.querySelector('[data-figure]');
        return {
          status: main?.dataset.status || '',
          paused: main?.dataset.paused || '',
          theme: main?.dataset.theme || '',
          total: main?.getAttribute('data-total-ms') || '',
          figure: figure?.dataset.figure || '',
          figureName: figure?.getAttribute('aria-label') || '',
          figureText: (figure?.textContent || '').trim(),
          body: document.body?.innerText || '',
          alerts: document.querySelectorAll('[role="alert"]').length,
          nodes,
        };
      })()`);
    },
    async click(role, name, { exact = false } = {}) {
      await expect.poll(async () => this.snap().then(snap => clickable(snap, role, name, exact)), { message: `click ${role} ${name}` }).toBe(true);
      const clicked = await evaluate(`(${clickInPage.toString()})(${JSON.stringify({ role, name, exact })})`);
      if (!clicked) throw new Error(`could not click ${role} ${name}`);
    },
    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
      await writeFile(file, Buffer.from(data, 'base64'));
    },
    async close() {
      await evaluate('window.close()').catch(() => {});
      ws.close();
    },
  };
}

// A popup that is already closing can remain in /json/list after its page socket
// stops answering. Waiting to attach to that socket, then for the global expect
// timeout, is the flake: absence is success, and a silent socket is abandoned.
export async function dismissPopup(debugPort, { budgetMs = 10_000, probeMs = 1_000 } = {}) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const list = await devtoolsList(debugPort, probeMs);
    if (list && !list.some(isPopupPage)) return;
    const target = list?.find(isPopupPage);
    if (target) await closePopupPage(target, probeMs).catch(() => {});
    if (Date.now() >= deadline) break;
    await delay(50);
  }
  const last = await devtoolsList(debugPort, probeMs);
  if (!last?.some(isPopupPage)) return;
  throw new Error('popup stayed open');
}

function isPopupPage(item) {
  return item?.type === 'page' && typeof item.url === 'string' && item.url.endsWith('/popup.html');
}

async function devtoolsList(debugPort, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function settleOnce() {
  let settled = false;
  return fn => {
    if (settled) return false;
    settled = true;
    fn();
    return true;
  };
}

function opened(ws, timeoutMs) {
  return new Promise((resolve, reject) => {
    const once = settleOnce();
    const timer = setTimeout(() => once(() => reject(new Error('debugger socket timed out'))), timeoutMs);
    const finish = fn => once(() => {
      clearTimeout(timer);
      fn();
    });
    ws.addEventListener('open', () => finish(resolve), { once: true });
    ws.addEventListener('error', () => finish(() => reject(new Error('debugger socket failed'))), { once: true });
    ws.addEventListener('close', () => finish(() => reject(new Error('debugger socket closed'))), { once: true });
  });
}

function command(ws, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const once = settleOnce();
    const timer = setTimeout(() => once(() => reject(new Error(`${method} timed out`))), timeoutMs);
    const finish = fn => once(() => {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      fn();
    });
    const onClose = () => finish(() => reject(new Error('debugger socket closed')));
    const onMessage = event => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id !== 1) return;
      if (message.error) finish(() => reject(new Error(message.error.message || 'debugger command failed')));
      else finish(() => resolve(message.result));
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
    try {
      ws.send(JSON.stringify({ id: 1, method, params }));
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function closePopupPage(target, timeoutMs) {
  if (!target?.webSocketDebuggerUrl) return;
  let ws;
  try {
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await opened(ws, timeoutMs);
    await command(ws, 'Runtime.evaluate', { expression: 'window.close()', returnByValue: true }, timeoutMs);
  } finally {
    ws?.close();
  }
}

function matches(node, role, name, exact) {
  if (node.role !== role) return false;
  if (name instanceof RegExp) return name.test(node.name);
  return exact ? node.name === name : node.name.includes(String(name));
}

function clickable(snap, role, name, exact) {
  return snap.nodes.some(node => matches(node, role, name, exact) && !node.disabled);
}

function clickInPage({ role, name, exact }) {
  const labelOf = el => {
    const labelled = el.getAttribute('aria-labelledby');
    const fromIds = labelled ? labelled.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ') : '';
    return (el.getAttribute('aria-label') || fromIds || el.innerText || '').replace(/\s+/g, ' ').trim();
  };
  const roleOf = el => el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : el.tagName === 'H1' ? 'heading' : el.tagName.toLowerCase());
  const wanted = typeof name === 'string' ? name : null;
  const pattern = name && typeof name === 'object' && name.source ? new RegExp(name.source, name.flags) : null;
  const node = [...document.querySelectorAll('button, h1, [role]')].find(el => {
    if (roleOf(el) !== role) return false;
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
    const label = labelOf(el);
    if (pattern) return pattern.test(label);
    return exact ? label === wanted : label.includes(wanted);
  });
  if (!node) return false;
  node.click();
  return true;
}

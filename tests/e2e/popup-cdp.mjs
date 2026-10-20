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

export async function dismissPopup(debugPort) {
  const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json()).catch(() => []);
  const target = list.find(item => item.type === 'page' && item.url?.endsWith('/popup.html'));
  if (!target) return;
  const popup = await attachPopup(debugPort);
  await popup.close();
  await expect.poll(async () => {
    const next = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
    return next.some(item => item.url?.endsWith('/popup.html'));
  }).toBe(false);
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

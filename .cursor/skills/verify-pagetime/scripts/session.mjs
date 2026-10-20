#!/usr/bin/env node
// Preview session for verify-pagetime. Starts the documented Vite dev server,
// checks that this process owns it, and stops only that process group.
// Evidence under /tmp/pagetime-verify-evidence is never deleted.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const STATE_DIR = '/tmp/pagetime-verify';
const EVIDENCE_ROOT = '/tmp/pagetime-verify-evidence';
const SESSION_FILE = path.join(STATE_DIR, 'preview.json');
const LOG_FILE = path.join(STATE_DIR, 'preview.log');

function usage() {
  console.error('usage: node .cursor/skills/verify-pagetime/scripts/session.mjs <launch|doctor|cleanup>');
  process.exit(2);
}

function requestedPort() {
  const raw = process.env.PAGETIME_PREVIEW_PORT;
  if (!raw) return 4173;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PAGETIME_PREVIEW_PORT must be an integer port');
  return port;
}

function originFor(port) {
  return `http://127.0.0.1:${port}`;
}

function readSession() {
  if (!existsSync(SESSION_FILE)) return null;
  const data = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
  if (!Number.isInteger(data?.pid) || data.pid <= 1 || !Number.isInteger(data?.port)) return null;
  return data;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim();
  } catch {
    return '';
  }
}

function isPreviewCommand(pid, port) {
  const command = cmdline(pid);
  return command.includes(String(port)) && (command.includes('vite') || command.includes('npm'));
}

function family(rootPid) {
  const children = new Map();
  for (const dir of readdirSync('/proc')) {
    if (!/^\d+$/.test(dir)) continue;
    let status;
    try { status = readFileSync(`/proc/${dir}/status`, 'utf8'); } catch { continue; }
    const match = /^PPid:\s+(\d+)/m.exec(status);
    if (!match) continue;
    const parent = Number(match[1]);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(Number(dir));
  }
  const out = new Set([rootPid]);
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    for (const child of children.get(pid) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

function listeningPids(port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10 || parts[3] !== '0A') continue;
      const portHex = parts[1].split(':')[1];
      if (portHex?.toUpperCase() !== hexPort) continue;
      inodes.add(parts[9]);
    }
  }
  const pids = [];
  for (const dir of readdirSync('/proc')) {
    if (!/^\d+$/.test(dir)) continue;
    let fds;
    try { fds = readdirSync(`/proc/${dir}/fd`); } catch { continue; }
    for (const fd of fds) {
      try {
        const target = readlinkSync(`/proc/${dir}/fd/${fd}`);
        const match = /^socket:\[(\d+)\]$/.exec(target);
        if (match && inodes.has(match[1])) pids.push(Number(dir));
      } catch { /* fd vanished */ }
    }
  }
  return [...new Set(pids)];
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => { socket.end(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

async function fetchDocument(origin) {
  const response = await fetch(origin);
  const body = await response.text();
  return { status: response.status, body };
}

function version() {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

function assertOutsideEvidence(target) {
  const resolved = path.resolve(target);
  if (resolved === EVIDENCE_ROOT || resolved.startsWith(EVIDENCE_ROOT + path.sep)) {
    throw new Error(`refusing to touch evidence at ${resolved}`);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function launch() {
  mkdirSync(STATE_DIR, { recursive: true });
  const port = requestedPort();
  const origin = originFor(port);
  const existing = readSession();
  if (existing && alive(existing.pid) && isPreviewCommand(existing.pid, existing.port)) {
    if (existing.port !== port) throw new Error(`preview already running on ${existing.port} as pid ${existing.pid}. Cleanup before launching ${port}.`);
    console.log(`PageTime preview ready ${origin} pid ${existing.pid}`);
    return;
  }
  if (existing && !alive(existing.pid)) rmSync(SESSION_FILE, { force: true });
  if (await portOpen(port)) {
    const owners = listeningPids(port);
    throw new Error(`127.0.0.1:${port} is already open (pid ${owners.join(', ') || 'unknown'}). Refusing to start a second preview. Set PAGETIME_PREVIEW_PORT to a free port, or stop the owner you started.`);
  }
  const logFd = openSync(LOG_FILE, 'w');
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  writeFileSync(SESSION_FILE, `${JSON.stringify({ pid: child.pid, port })}\n`);
  const started = Date.now();
  let ready = false;
  while (Date.now() - started < 60_000) {
    const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : '';
    if (log.includes('Local:') && log.includes(`${origin}/`) && await portOpen(port)) {
      const document = await fetchDocument(origin).catch(() => null);
      if (document?.status === 200 && document.body.includes('id="root"') && document.body.includes('PageTime')) {
        ready = true;
        break;
      }
    }
    if (!alive(child.pid)) throw new Error(`preview process exited early. See ${LOG_FILE}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`preview did not become ready. See ${LOG_FILE}`);
  console.log(`PageTime preview ready ${origin} pid ${child.pid}`);
}

async function doctor() {
  const session = readSession();
  if (!session || !alive(session.pid)) throw new Error('preview process is not running. Run launch first.');
  if (process.env.PAGETIME_PREVIEW_PORT && requestedPort() !== session.port) {
    throw new Error(`PAGETIME_PREVIEW_PORT=${requestedPort()} does not match the running preview on ${session.port}`);
  }
  const { pid, port } = session;
  const origin = originFor(port);
  if (!isPreviewCommand(pid, port)) throw new Error(`pid ${pid} is not the preview command: ${cmdline(pid)}`);
  const owners = listeningPids(port);
  const group = family(pid);
  const owned = owners.filter(owner => group.has(owner));
  if (!owned.length) throw new Error(`port ${port} listeners ${owners.join(', ') || 'none'} are not descendants of pid ${pid}`);
  const document = await fetchDocument(origin);
  if (document.status !== 200 || !document.body.includes('id="root"') || !document.body.includes('PageTime')) {
    throw new Error(`GET ${origin}/ did not return the PageTime document (status ${document.status})`);
  }
  const { chromium } = await import('@playwright/test');
  const channel = process.env.PAGETIME_CHROME_CHANNEL;
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => localStorage.setItem('pagetime-language', 'en'));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Browsing overview' }).waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-status="empty"], [data-status="ready"]'), null, { timeout: 30_000 });
    const status = await page.locator('[data-status="empty"], [data-status="ready"]').first().getAttribute('data-status');
    const failed = await page.getByRole('alert').filter({ hasText: "Couldn't load or save data" }).count();
    if (failed) throw new Error('dashboard is showing the load/save error alert');
    console.log(`PageTime preview doctor ok version ${version()} pid ${pid} port ${port} listeners ${owned.join(',')} status ${status} evidence ${EVIDENCE_ROOT}`);
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  const session = readSession();
  if (!session) {
    console.log('PageTime preview stopped (no session file)');
    return;
  }
  if (process.env.PAGETIME_PREVIEW_PORT && requestedPort() !== session.port) {
    throw new Error(`PAGETIME_PREVIEW_PORT=${requestedPort()} does not match the running preview on ${session.port}`);
  }
  const { pid, port } = session;
  if (alive(pid)) {
    if (!isPreviewCommand(pid, port)) throw new Error(`refusing to signal pid ${pid}: ${cmdline(pid)}`);
    assertOutsideEvidence(STATE_DIR);
    try { process.kill(-pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    const deadline = Date.now() + 5_000;
    while (alive(pid) && Date.now() < deadline) sleep(100);
    if (alive(pid)) {
      try { process.kill(-pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  assertOutsideEvidence(SESSION_FILE);
  assertOutsideEvidence(LOG_FILE);
  rmSync(SESSION_FILE, { force: true });
  rmSync(LOG_FILE, { force: true });
  console.log(`PageTime preview stopped pid ${pid}. Evidence remains at ${EVIDENCE_ROOT}`);
}

const command = process.argv[2];
const run = command === 'launch' ? launch : command === 'doctor' ? doctor : command === 'cleanup' ? cleanup : null;
if (!run) usage();
Promise.resolve(run()).catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});

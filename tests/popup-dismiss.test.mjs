import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { dismissPopup } from './e2e/popup-cdp.mjs';

const popupUrl = 'chrome-extension://pagetime/popup.html';

function popupTarget(port) {
  return {
    id: 'popup-1',
    type: 'page',
    url: popupUrl,
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/1`,
  };
}

function takeFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) return null;
  const maskLength = masked ? 4 : 0;
  if (buffer.length < offset + maskLength + length) return null;
  const data = Buffer.from(buffer.subarray(offset + maskLength, offset + maskLength + length));
  if (masked) {
    const mask = buffer.subarray(offset, offset + maskLength);
    for (let index = 0; index < data.length; index += 1) data[index] ^= mask[index % 4];
  }
  return { opcode, text: data.toString('utf8'), rest: buffer.subarray(offset + maskLength + length) };
}

function sendText(socket, text) {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(payload.length < 126 ? 2 : 4);
  header[0] = 0x81;
  if (payload.length < 126) header[1] = payload.length;
  else {
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server, sockets) {
  for (const socket of sockets) socket.destroy();
  return new Promise(resolve => server.close(() => resolve()));
}

function track(server) {
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });
  return sockets;
}

async function blackhole() {
  const server = net.createServer();
  const sockets = track(server);
  let accepted = 0;
  server.on('connection', () => {
    accepted += 1;
  });
  const port = await listen(server);
  return { port, accepted: () => accepted, close: () => closeServer(server, sockets) };
}

async function devtools({ list, command = () => ({}) }) {
  const server = http.createServer((request, response) => {
    request.on('error', () => {});
    response.on('error', () => {});
    const body = list(request.url);
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    if (body === null) return;
    response.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
    response.end(JSON.stringify(body));
  });
  const sockets = track(server);
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const frame = takeFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode !== 0x1) continue;
        const message = JSON.parse(frame.text);
        sendText(socket, JSON.stringify({ id: message.id, result: command(message.method, message.params) ?? {} }));
      }
    });
  });
  const port = await listen(server);
  return { port, close: () => closeServer(server, sockets) };
}

test('dismissPopup returns when a listed popup disappears before its socket answers', { timeout: 2_000 }, async () => {
  const hole = await blackhole();
  let reads = 0;
  const server = await devtools({
    list: () => {
      reads += 1;
      return reads === 1 ? [popupTarget(hole.port)] : [];
    },
  });
  const started = Date.now();
  try {
    await dismissPopup(server.port, { budgetMs: 10_000, probeMs: 300 });
    assert.ok(reads >= 2);
    assert.equal(hole.accepted() >= 1, true);
    assert.ok(Date.now() - started < 1_000);
  } finally {
    await server.close();
    await hole.close();
  }
});

test('dismissPopup closes a live popup and waits until the target is gone', async () => {
  const commands = [];
  const state = { port: 0, open: true };
  const server = await devtools({
    list: () => (state.open ? [popupTarget(state.port)] : []),
    command: (method, params) => {
      commands.push({ method, params });
      state.open = false;
      return { result: { type: 'undefined' } };
    },
  });
  state.port = server.port;
  try {
    await dismissPopup(server.port, { budgetMs: 2_000, probeMs: 1_000 });
    assert.deepEqual(commands, [{
      method: 'Runtime.evaluate',
      params: { expression: 'window.close()', returnByValue: true },
    }]);
    assert.equal(state.open, false);
  } finally {
    await server.close();
  }
});

test('dismissPopup reports a popup that stays listed when the socket never answers', { timeout: 2_000 }, async () => {
  const hole = await blackhole();
  const server = await devtools({ list: () => [popupTarget(hole.port)] });
  const started = Date.now();
  try {
    await assert.rejects(
      () => dismissPopup(server.port, { budgetMs: 250, probeMs: 80 }),
      /popup stayed open/,
    );
    assert.ok(Date.now() - started < 1_500);
  } finally {
    await server.close();
    await hole.close();
  }
});

test('dismissPopup abandons a stalled devtools list instead of hanging', { timeout: 2_000 }, async () => {
  let reads = 0;
  const server = await devtools({
    list: () => {
      reads += 1;
      return reads === 1 ? null : [];
    },
  });
  const started = Date.now();
  try {
    await dismissPopup(server.port, { budgetMs: 2_000, probeMs: 150 });
    assert.ok(reads >= 2);
    assert.ok(Date.now() - started < 1_000);
  } finally {
    await server.close();
  }
});

test('dismissPopup rejects when every devtools list read fails', { timeout: 2_000 }, async () => {
  let reads = 0;
  const server = await devtools({
    list: () => {
      reads += 1;
      return null;
    },
  });
  const started = Date.now();
  try {
    await assert.rejects(
      () => dismissPopup(server.port, { budgetMs: 180, probeMs: 40 }),
      /devtools list unavailable/,
    );
    assert.ok(reads >= 2);
    assert.ok(Date.now() - started < 1_500);
  } finally {
    await server.close();
  }
});

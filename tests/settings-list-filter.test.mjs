const { after, before, test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { readFileSync } = await import('node:fs');
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { filterHosts } = await import('../src/host-filter.mjs');

const { window } = parseHTML('<!doctype html><html><body></body></html>');
const memory = new Map([['pagetime-language', 'en']]);
// React routes onChange by input.type and probes 'oninput' on document; linkedom reports neither.
window.document.oninput = null;
Object.defineProperty(window.HTMLInputElement.prototype, 'type', { get() { return this.getAttribute('type') || 'text'; }, set(value) { this.setAttribute('type', value); } });
window.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(String(key), String(value)),
  removeItem: key => memory.delete(key),
  clear: () => memory.clear(),
  key: index => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};
window.location = { protocol: 'http:', href: 'http://127.0.0.1:4174/', hostname: '127.0.0.1', host: '127.0.0.1:4174', origin: 'http://127.0.0.1:4174', pathname: '/', search: '', hash: '' };

const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'Element', 'Node', 'location', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, location: window.location, localStorage: window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');

let server;
let IgnoredSites;

before(async () => {
  const react = (await import('@vitejs/plugin-react')).default;
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@app': fileURLToPath(new URL('../src', import.meta.url)) } },
    plugins: [react()],
    cacheDir: '/tmp/pagetime-settings-list-filter-vite',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
  });
  await server.ssrLoadModule('/src/i18n.js');
  ({ IgnoredSites } = await server.ssrLoadModule('/src/IgnoredSites.jsx'));
});

after(async () => {
  await server?.close();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

const hosts = ['github.com', 'gist.github.com', 'example.com', 'mail.example.com', 'news.ycombinator.com'];

test('filterHosts matches a case-insensitive substring and an empty query keeps the full list', () => {
  assert.deepEqual(filterHosts(hosts, 'github'), ['github.com', 'gist.github.com']);
  assert.deepEqual(filterHosts(hosts, '  GitHub '), ['github.com', 'gist.github.com']);
  assert.deepEqual(filterHosts(hosts, 'ample.c'), ['example.com', 'mail.example.com']);
  assert.deepEqual(filterHosts(hosts, 'zzz'), []);
  assert.equal(filterHosts(hosts, ''), hosts);
  assert.equal(filterHosts(hosts, '   '), hosts);
});

async function mount(props, key = 'ignored') {
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host);
  const view = { host, root, props };
  view.render = async (next = view.props, nextKey = key) => {
    view.props = next;
    await React.act(async () => { root.render(React.createElement(IgnoredSites, { key: nextKey, ...next })); });
  };
  await view.render();
  return view;
}

async function unmount(view) {
  await React.act(async () => { view.root.unmount(); });
  view.host.remove();
}

const rows = view => [...view.host.querySelectorAll('ul > li')].map(item => item.querySelector('span').textContent);
const filterInput = view => view.host.querySelector('input[aria-label="Filter ignored sites"]');

async function type(input, value) {
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function click(element) {
  await React.act(async () => { element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); });
}

test('typing a fragment shows only matching hosts, the clear button restores the full list', async () => {
  const view = await mount({ settings: { ignored: hosts }, busy: false, onSave() {} });
  try {
    assert.deepEqual(rows(view), hosts);
    assert.equal(view.host.querySelector('button[aria-label="Clear filter"]'), null);
    await type(filterInput(view), 'github');
    assert.deepEqual(rows(view), ['github.com', 'gist.github.com']);
    await type(filterInput(view), 'zzz');
    assert.deepEqual(rows(view), []);
    assert.match(view.host.textContent, /No matching sites/);
    assert.doesNotMatch(view.host.textContent, /No ignored sites/);
    await click(view.host.querySelector('button[aria-label="Clear filter"]'));
    assert.equal(filterInput(view).value, '');
    assert.deepEqual(rows(view), hosts);
  } finally {
    await unmount(view);
  }
});

test('removing under a filter saves the full list minus that host, and adding is unaffected by the filter', async () => {
  const saved = [];
  const view = await mount({ settings: { schema: 1, ignored: hosts }, busy: false, onSave: value => saved.push(value) });
  try {
    await type(filterInput(view), 'example');
    await click(view.host.querySelector('button[aria-label="Remove mail.example.com"]'));
    assert.deepEqual(saved.at(-1).ignored, hosts.filter(host => host !== 'mail.example.com'));
    assert.equal(saved.at(-1).schema, 1);

    const add = view.host.querySelector('input[aria-label="Host to ignore"]');
    await type(add, 'new.example.net');
    await React.act(async () => { view.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.deepEqual(saved.at(-1).ignored, [...hosts, 'new.example.net']);
  } finally {
    await unmount(view);
  }
});

test('an empty list shows no filter and the empty title; a stale query stays reachable after the list empties', async () => {
  const view = await mount({ settings: { ignored: [] }, busy: false, onSave() {} });
  try {
    assert.equal(filterInput(view), null);
    assert.match(view.host.textContent, /No ignored sites/);
    await view.render({ settings: { ignored: ['example.com'] }, busy: false, onSave() {} });
    await type(filterInput(view), 'exa');
    await view.render({ settings: { ignored: [] }, busy: false, onSave() {} });
    assert.equal(filterInput(view).value, 'exa');
  } finally {
    await unmount(view);
  }
});

test('switching between blacklist and whitelist remounts the list and resets the filter, each field has its own labels', async () => {
  const settings = { ignored: hosts, allowed: ['allowed.test', 'other.test'] };
  const view = await mount({ settings, busy: false, onSave() {}, field: 'ignored' }, 'ignored');
  try {
    await type(filterInput(view), 'github');
    assert.deepEqual(rows(view), ['github.com', 'gist.github.com']);
    await view.render({ ...view.props, field: 'allowed' }, 'allowed');
    assert.deepEqual(rows(view), ['allowed.test', 'other.test']);
    assert.equal(view.host.querySelector('input[aria-label="Filter allowed sites"]').value, '');
    await view.render({ ...view.props, field: 'ignored' }, 'ignored');
    assert.equal(filterInput(view).value, '');
    assert.deepEqual(rows(view), hosts);
  } finally {
    await unmount(view);
  }
});

test('the settings page keys the list by mode so a mode switch resets the filter', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<IgnoredSites key=\{listField\} field=\{listField\}/);
});

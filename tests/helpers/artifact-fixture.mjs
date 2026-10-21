import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const bytes = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

export function artifact(version = '1.0.1') {
  const locales = Object.fromEntries(readdirSync(new URL('public/_locales', root)).map(code => [code, JSON.parse(readFileSync(new URL(`public/_locales/${code}/messages.json`, root), 'utf8'))]));
  const manifest = {
    manifest_version: 3, name: 'PageTime', version, default_locale: 'en', incognito: 'not_allowed',
    description: '__MSG_extDescription__', action: { default_title: '__MSG_actionTitle__', default_popup: 'popup.html' },
    permissions: ['storage', 'tabs', 'webNavigation', 'idle', 'alarms'],
    background: { service_worker: 'background.js' },
    icons: Object.fromEntries([16, 32, 48, 96, 128].map(size => [size, `icon/${size}.png`]))
  };
  const files = {
    'manifest.json': bytes(manifest), 'background.js': bytes('console.log("background");'),
    'dashboard.html': bytes('<script type="module" src="/dashboard.js"></script><link href="/dashboard.css" rel="stylesheet">'),
    'dashboard.js': bytes('console.log("dashboard");'), 'dashboard.css': bytes('body {}'),
    'popup.html': bytes('<script type="module" src="/popup.js"></script><link href="/popup.css" rel="stylesheet">'),
    'popup.js': bytes('console.log("popup");'), 'popup.css': bytes('body {}'),
    'import-parse-worker.js': bytes('self.onmessage=()=>{self.postMessage({value:JSON.parse("{}")});};')
  };
  for (const [code, messages] of Object.entries(locales)) files[`_locales/${code}/messages.json`] = bytes(messages);
  for (const file of Object.values(manifest.icons)) files[file] = readFileSync(new URL(`public/${file}`, root));
  return { files, locales, manifest, version };
}

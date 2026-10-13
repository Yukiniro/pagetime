import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const chrome = process.env.CHROME_PATH ?? '/opt/google/chrome/chrome';
const publicDir = new URL('../public/', import.meta.url);

const background = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f8ff7"/>
      <stop offset="0.55" stop-color="#1f63d8"/>
      <stop offset="1" stop-color="#1747a6"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="30" fill="url(#bg)"/>`;

const fullMark = `<circle cx="64" cy="64" r="41" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="14"/>
  <circle cx="64" cy="64" r="41" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-dasharray="180 258" transform="rotate(-90 64 64)"/>
  <rect x="43" y="62" width="11" height="20" rx="3.5" fill="#fff"/>
  <rect x="58.5" y="46" width="11" height="36" rx="3.5" fill="#fff"/>
  <rect x="74" y="55" width="11" height="27" rx="3.5" fill="#fff"/>`;

// Snapped to the 16px pixel grid (8 units per pixel); the time ring is unreadable at this size.
const toolbarMark = `<rect x="32" y="64" width="16" height="40" rx="4" fill="#fff"/>
  <rect x="56" y="32" width="16" height="72" rx="4" fill="#fff"/>
  <rect x="80" y="48" width="16" height="56" rx="4" fill="#fff"/>`;

const svg = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  ${background}
  ${mark}
</svg>
`;

// Chrome expects 128px install icons to keep 16px transparent padding; smaller sizes fill the canvas.
const icons = [
  { size: 16, svg: svg(toolbarMark), padding: 0 },
  { size: 32, svg: svg(fullMark), padding: 0 },
  { size: 48, svg: svg(fullMark), padding: 0 },
  { size: 96, svg: svg(fullMark), padding: 0 },
  { size: 128, svg: svg(fullMark), padding: 16 },
];

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pagetime-icons-'));
const page = path.join(tmp, 'render.html');
await fs.writeFile(page, `<!doctype html><body><script>
(async () => {
  const out = [];
  for (const { size, svg, padding } of ${JSON.stringify(icons)}) {
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(image, padding, padding, size - padding * 2, size - padding * 2);
    out.push(size + ' ' + canvas.toDataURL('image/png'));
  }
  document.body.textContent = out.join('\\n');
})();
</script></body>`);

const dom = execFileSync(chrome, [
  '--headless', '--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'profile')}`,
  '--virtual-time-budget=5000', '--dump-dom', `file://${page}`,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
await fs.rm(tmp, { recursive: true, force: true });

const rendered = [...dom.matchAll(/(\d+) data:image\/png;base64,([A-Za-z0-9+/=]+)/g)];
if (rendered.length !== icons.length) throw new Error(`Rendered ${rendered.length}/${icons.length} icons`);

await fs.mkdir(new URL('icon/', publicDir), { recursive: true });
for (const [, size, data] of rendered) await fs.writeFile(new URL(`icon/${size}.png`, publicDir), Buffer.from(data, 'base64'));
await fs.writeFile(new URL('favicon.svg', publicDir), svg(fullMark));

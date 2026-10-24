import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const publicDir = new URL('../public/', import.meta.url);
const source = await fs.readFile(new URL('../assets/branding/pagetime-logo.png', import.meta.url));
// The install icon keeps 16px clearspace; toolbar sizes use the full mark.
const icons = [16, 32, 48, 96, 128].map(size => ({ size, padding: size === 128 ? 16 : 0 }));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
let rendered;
try {
  const page = await browser.newPage();
  rendered = await page.evaluate(async ({ source, icons }) => {
  const image = new Image();
  image.src = 'data:image/png;base64,' + source;
  await image.decode();
  const original = document.createElement('canvas');
  original.width = image.naturalWidth;
  original.height = image.naturalHeight;
  const originalContext = original.getContext('2d', { willReadFrequently: true });
  originalContext.drawImage(image, 0, 0);
  const pixels = originalContext.getImageData(0, 0, original.width, original.height).data;
  let left = original.width, top = original.height, right = -1, bottom = -1;
  for (let y = 0; y < original.height; y++) {
    for (let x = 0; x < original.width; x++) {
      if (pixels[(y * original.width + x) * 4 + 3] <= 200) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error('Logo has no opaque mark');
  const width = right - left + 1, height = bottom - top + 1;
  const out = [];
  for (const { size, padding } of icons) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const scale = (size - padding * 2) / Math.max(width, height);
    const context = canvas.getContext('2d');
    context.drawImage(image, left, top, width, height,
      (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
    const alpha = context.getImageData(0, 0, size, size).data;
    const opaque = alpha.filter((value, index) => index % 4 === 3 && value > 200).length;
    if (opaque < size * size / 8) throw new Error('Rendered logo is too small or empty');
    out.push({ size, png: canvas.toDataURL('image/png').split(',')[1] });
  }
  return out;
  }, { source: source.toString('base64'), icons });
} finally {
  await browser.close();
}

// Validate every result before replacing any packaged icon.
assert.equal(rendered.length, icons.length);
for (const { size, png } of rendered) {
  const bytes = Buffer.from(png, 'base64');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}
await fs.mkdir(new URL('icon/', publicDir), { recursive: true });
for (const { size, png } of rendered) await fs.writeFile(new URL(`icon/${size}.png`, publicDir), Buffer.from(png, 'base64'));
await fs.copyFile(new URL('icon/32.png', publicDir), new URL('favicon.png', publicDir));
console.log(`Generated ${rendered.length} PageTime icons and favicon from the selected logo.`);

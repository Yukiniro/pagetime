import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const REPO = 'https://github.com/Yukiniro/pagetime/blob/main';

async function openDashboard(context, language) {
  const worker = context.serviceWorkers().at(-1) ?? await context.waitForEvent('serviceworker');
  const dashboard = await context.newPage();
  await dashboard.goto(new URL('/dashboard.html', worker.url()).href);
  await dashboard.evaluate(code => localStorage.setItem('pagetime-language', code), language);
  await dashboard.reload();
  return dashboard;
}

async function withExtension(fn) {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-docs-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage'],
  });
  try {
    await fn(context);
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

test('settings ends with links to the repository docs and no rules, storage, or local-data section', async () => {
  await withExtension(async context => {
    const dashboard = await openDashboard(context, 'en');
    await expect(dashboard.getByRole('button', { name: /counted/i })).toHaveCount(0);
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(dashboard.getByRole('heading', { name: 'Export data' })).toBeVisible();

    const timing = dashboard.getByRole('link', { name: 'Timing rules and privacy notes' });
    const privacy = dashboard.getByRole('link', { name: 'Privacy policy' });
    await expect(timing).toHaveAttribute('href', `${REPO}/docs/timing.md`);
    await expect(privacy).toHaveAttribute('href', `${REPO}/PRIVACY.md`);
    for (const link of [timing, privacy]) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }

    for (const name of ["How it's measured", 'Local and private', 'Local data']) await expect(dashboard.getByRole('heading', { name })).toHaveCount(0);
    await expect(dashboard.getByRole('button', { name: /How time is counted/ })).toHaveCount(0);

    const records = dashboard.locator('.setting-row', { has: dashboard.getByRole('heading', { name: 'Browsing records', level: 2 }) });
    const audio = records.getByRole('switch', { name: 'Keep counting while audio plays' });
    await expect(audio).toBeVisible();
    await expect(records.getByRole('button', { name: /^Idle threshold: / })).toBeVisible();
    const before = await audio.getAttribute('aria-checked');
    await audio.click();
    await expect(audio).not.toHaveAttribute('aria-checked', before);
  });
});

test('the overview has no explainer button and the settings links follow the language', async () => {
  await withExtension(async context => {
    const dashboard = await openDashboard(context, 'zh-CN');
    await expect(dashboard.getByRole('heading', { level: 1 })).toHaveText('浏览概览');
    await expect(dashboard.getByRole('button', { name: /如何计时|了解计时规则/ })).toHaveCount(0);
    await dashboard.getByRole('button', { name: '设置', exact: true }).click();
    await expect(dashboard.getByRole('link', { name: '计时规则与隐私说明' })).toHaveAttribute('href', `${REPO}/docs/timing.zh-CN.md`);
    await expect(dashboard.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', `${REPO}/PRIVACY.zh-CN.md`);
  });
});

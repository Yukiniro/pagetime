import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('real i18next resources switch all ten languages and localize dates, times, durations and plurals', async () => {
  const previous = globalThis.document;
  globalThis.document = { documentElement: {}, title: '' };
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: i18n, languages, formatDate, timeLabel, duration } = await server.ssrLoadModule('/src/i18n.js');
    const at = new Date(2026, 9, 17, 14, 30).getTime();
    for (const [code] of languages) {
      await i18n.changeLanguage(code);
      assert.equal(i18n.resolvedLanguage, code);
      assert.equal(document.documentElement.lang, code);
      assert.equal(document.title, i18n.t('appTitle'));
      assert.equal(formatDate(at), new Date(at).toLocaleDateString(code));
      assert.equal(timeLabel(at), new Date(at).toLocaleTimeString(code, { hour: '2-digit', minute: '2-digit', hour12: false }));
      for (const count of [0, 1, 2, 5, 21]) {
        const category = new Intl.PluralRules(code).select(count);
        const text = i18n.t('records.count', { count });
        const template = i18n.getResource(code, 'translation', `records.count_${category}`);
        assert.equal(text, template.replaceAll('{{count}}', String(count)));
        assert.equal(duration(count * 60_000), i18n.t('duration.minutes', { count }));
      }
      assert.equal(duration(3_660_000), i18n.t('duration.hours', { hours: 1, minutes: 1 }));
      assert.ok(!i18n.t('error.data').includes('{{'));
    }
    await i18n.changeLanguage('it');
    assert.equal(i18n.resolvedLanguage, 'en');
    assert.equal(i18n.options.detection.convertDetectedLanguage('zh-HK'), 'zh-TW');
  } finally {
    await server.close();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('website localization is independent of the extension instance and resources', async () => {
  const previous = globalThis.document;
  globalThis.document = { documentElement: {}, title: '' };
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: app } = await server.ssrLoadModule('/src/i18n.js');
    await app.changeLanguage('en');
    const { default: website, languages, formatDate, timeLabel, duration } = await server.ssrLoadModule('/website/i18n.js');
    assert.notEqual(website, app);
    assert.equal(website.options.detection.lookupLocalStorage, 'pagetime-website-language');
    const at = new Date(2026, 9, 24, 14, 30).getTime();
    for (const [code] of languages) {
      await website.changeLanguage(code);
      assert.equal(website.resolvedLanguage, code);
      assert.equal(app.resolvedLanguage, 'en');
      assert.equal(document.documentElement.lang, code);
      assert.equal(document.title, website.t('home.title'));
      assert.equal(formatDate(at), new Date(at).toLocaleDateString(code));
      assert.equal(timeLabel(at), new Date(at).toLocaleTimeString(code, { hour: '2-digit', minute: '2-digit', hour12: false }));
      assert.equal(duration(16_320_000), website.t('duration.hours', { hours: 4, minutes: 32 }));
      for (const count of [0, 1, 2, 5, 21]) assert.equal(duration(count * 60_000), website.t('duration.minutes', { count }));
      assert.equal(website.exists('records.view'), false);
      assert.equal(app.exists('home.headline'), false);
    }
    assert.equal(website.options.detection.convertDetectedLanguage('zh-HK'), 'zh-TW');
    await website.changeLanguage('it');
    assert.equal(website.resolvedLanguage, 'en');
  } finally {
    await server.close();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

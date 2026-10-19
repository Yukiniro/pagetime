import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={protocol:'http:'};
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const {command,colorOf,knownSites,palette}=await import('../src/data.js');
test('domain colors stay stable',()=>{
  assert.equal(colorOf(knownSites[0]),palette[0]);assert.equal(colorOf('example.com'),colorOf('example.com'));assert.ok(palette.includes(colorOf('baidu.com')));
});
test('preview starts empty, ignores unrelated keys, and persists pause and clear',async()=>{
  values.clear();
  values.set('jilan-demo-v1',JSON.stringify({visits:[{domain:'github.com',at:1}],spans:[{domain:'github.com',start:1,end:2}],enabled:true,since:1}));
  const initial=await command();
  assert.equal(initial.visits.length,0);assert.equal(initial.spans.length,0);assert.equal(initial.enabled,true);
  assert.equal(values.has('jilan-demo-v1'),true);
  assert.equal((await command('toggle')).enabled,false);assert.equal((await command()).enabled,false);
  const cleared=await command('clear');assert.equal(cleared.visits.length,0);assert.equal(cleared.spans.length,0);assert.equal(cleared.enabled,false);
});

test('invalid JSON and invalid record shapes are preserved across snapshot, toggle and clear', async () => {
  const { blankData } = await import('../src/model.mjs');
  for (const raw of ['{', 'null', '{}', JSON.stringify({ ...blankData(), visits: [{ domain: 'example.com/private', at: 1 }] }), JSON.stringify({ ...blankData(), spans: [{ domain: 'example.com', start: 2, end: 1 }] })]) {
    values.set('pagetime-preview', raw);
    for (const type of ['snapshot', 'toggle', 'clear']) {
      await assert.rejects(command(type), /^Error: data$/);
      assert.equal(values.get('pagetime-preview'), raw);
    }
  }
  values.set('pagetime-preview', JSON.stringify(blankData()));
  assert.equal((await command()).enabled, true);
});

test('preview settings are stored apart from records and invalid values fall back', async () => {
  const { DEFAULT_SETTINGS } = await import('../src/settings.mjs');
  values.clear();
  assert.deepEqual(await command('settings'), DEFAULT_SETTINGS);
  assert.equal(values.has('pagetime-preview-settings'), false);
  const saved = await command('settings', { settings: { schema: 1, idleSeconds: 300, countAudible: false } });
  assert.deepEqual(saved, { schema: 1, idleSeconds: 300, countAudible: false, siteMerge: 'prefix', recordMode: 'blacklist', ignored: [], allowed: [], badge: true });
  const scoped = await command('settings', { settings: { ...saved, recordMode: 'whitelist', ignored: ['a.com'], allowed: ['b.com'] } });
  assert.equal(scoped.recordMode, 'whitelist');
  assert.deepEqual(scoped.ignored, ['a.com']);
  assert.deepEqual(scoped.allowed, ['b.com']);
  const back = await command('settings', { settings: { ...scoped, recordMode: 'blacklist' } });
  assert.equal(back.recordMode, 'blacklist');
  assert.deepEqual(back.ignored, ['a.com']);
  assert.deepEqual(back.allowed, ['b.com']);
  assert.deepEqual(await command('settings'), back);
  assert.equal((await command('settings', { settings: { ...saved, siteMerge: 'none' } })).siteMerge, 'none');
  assert.equal(values.has('pagetime-preview'), false);
  values.set('pagetime-preview-settings', '{');
  assert.deepEqual(await command('settings'), DEFAULT_SETTINGS);
  assert.deepEqual(await command('settings', { settings: { schema: 2, idleSeconds: 15, countAudible: 'yes' } }), DEFAULT_SETTINGS);
});

test('preview deleteSite and deleteDay remove only the named records', async () => {
  const start = new Date(2026, 9, 18, 9).getTime();
  const end = start + 60 * 60_000;
  const next = new Date(2026, 9, 19, 1).getTime();
  values.set('pagetime-preview', JSON.stringify({
    enabled: true,
    since: new Date(2026, 9, 1).getTime(),
    visits: [{ domain: 'a.test', at: start }, { domain: 'b.test', at: start }, { domain: 'a.test', at: next }],
    spans: [
      { domain: 'a.test', start, end: next + 30 * 60_000 },
      { domain: 'b.test', start, end },
      { domain: 'www.youtube.com', start: next, end: next + 20 * 60_000 },
      { domain: 'gist.github.com', start: next, end: next + 20 * 60_000 },
    ],
  }));
  const day = await command('deleteDay', { date: '2026-10-18' });
  assert.deepEqual(day.visits.map(visit => [visit.domain, visit.at]), [['a.test', next]]);
  assert.equal(day.spans.some(span => span.domain === 'b.test'), false);
  assert.equal(day.spans.find(span => span.domain === 'a.test').start, new Date(2026, 9, 19).getTime());
  const removed = await command('deleteSite', { host: 'youtube.com', hosts: ['www.youtube.com', 'youtube.com'] });
  assert.equal(removed.spans.some(span => span.domain === 'www.youtube.com'), false);
  assert.equal(removed.spans.some(span => span.domain === 'gist.github.com'), true);
  const site = await command('deleteSite', { host: 'a.test' });
  assert.equal(site.spans.some(span => span.domain === 'a.test'), false);
  assert.equal(site.visits.length, 0);
  const again = await command('deleteSite', { host: 'missing.test' });
  assert.equal(again.spans.some(span => span.domain === 'gist.github.com'), true);
  const same = await command('deleteDay', { date: 'not-a-day' });
  assert.equal(same.spans.some(span => span.domain === 'gist.github.com'), true);
});

test('snapshots never write storage and storage failures are reported', async () => {
  values.clear();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { ...previous, setItem() { throw new Error('quota'); } };
  try {
    assert.equal((await command()).visits.length, 0);
    await assert.rejects(command('toggle'), /^Error: save$/);
    assert.equal(values.has('pagetime-preview'), false);
  } finally { globalThis.localStorage = previous; }
});

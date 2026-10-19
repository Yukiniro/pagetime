import { LEDGER_ERROR_KEY } from './ledger.mjs';
import { addDays, blankData, dateKeyStart, spansAfterDayRemoval } from './model.mjs';
import { siteOf } from './site.mjs';
import { DEFAULT_SETTINGS, validateSettings } from './settings.mjs';
import { validateData } from './validate-data.mjs';
export const isExtension = ['chrome-extension:', 'moz-extension:'].includes(location.protocol);
export const palette = ['#2875ff','#20bfa5','#ffb32c','#8870ff','#20b5c7','#8d9ab2'];
export const knownSites = ['github.com','wxt.dev','developer.mozilla.org','youtube.com','notion.so'];
export const colorOf = domain => palette[knownSites.includes(domain)?knownSites.indexOf(domain):[...domain].reduce((n,c)=>(n+c.charCodeAt(0))%palette.length,0)];
export function iconHost(domain, site = siteOf(domain, 'prefix')) {
  if (typeof site === 'string' && knownSites.includes(site)) return site;
  if (typeof domain === 'string' && knownSites.includes(domain)) return domain;
  return '';
}
export function iconForSite(site, hosts = []) {
  const direct = iconHost(site, site);
  if (direct) return direct;
  const known = hosts.filter(host => knownSites.includes(host.domain));
  return known.length === 1 ? known[0].domain : '';
}
const previewKey = 'pagetime-preview';
const previewSettingsKey = 'pagetime-preview-settings';
function readPreviewSettings() {
  let raw;
  try { raw = localStorage.getItem(previewSettingsKey); }
  catch { throw new Error('save'); }
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try { return validateSettings(JSON.parse(raw)); }
  catch { return { ...DEFAULT_SETTINGS }; }
}
// In the extension, snapshot/toggle/clear resolve to nothing: the dashboard reads the ledger with useLiveQuery.
export async function command(type='snapshot', body) {
  if(isExtension){
    const {browser}=await import('wxt/browser');
    const response=await browser.runtime.sendMessage(body===undefined?{type}:{type,...body});
    if(response?.error) throw new Error(response.error);
    if(type==='settings'){
      if(!response?.settings) throw new Error('connect');
      return validateSettings(response.settings);
    }
    if(!response?.ok) throw new Error('connect');
    return undefined;
  }
  if(type==='settings'){
    const settings=body?.settings===undefined?readPreviewSettings():validateSettings(body.settings);
    if(body?.settings!==undefined){
      try { localStorage.setItem(previewSettingsKey,JSON.stringify(settings)); }
      catch { throw new Error('save'); }
    }
    return settings;
  }
  let saved;
  try { saved=localStorage.getItem(previewKey); }
  catch { throw new Error('save'); }
  let data;
  try { data=saved===null?blankData():validateData(JSON.parse(saved)); }
  catch { throw new Error('data'); }
  if(type==='toggle') data.enabled=!data.enabled;
  if(type==='clear'){data.visits=[];data.spans=[];data.since=Date.now();}
  if(type==='deleteSite'){
    const names=new Set([body?.host, ...(Array.isArray(body?.hosts)?body.hosts:[])].filter(host=>typeof host==='string'&&host));
    if(names.size){
      data.visits=data.visits.filter(visit=>!names.has(visit.domain));
      data.spans=data.spans.filter(span=>!names.has(span.domain));
    }
  }
  if(type==='deleteDay'){
    const start=dateKeyStart(body?.date);
    if(start!==null){
      const end=addDays(start,1);
      data.visits=data.visits.filter(visit=>visit.at<start||visit.at>=end);
      data.spans=data.spans.flatMap(span=>{
        if(span.end<=start||span.start>=end) return [span];
        return spansAfterDayRemoval(span,start,end).map(part=>({domain:span.domain,start:part.start,end:part.end}));
      });
    }
  }
  if(type!=='snapshot') {
    try { localStorage.setItem(previewKey,JSON.stringify(data)); }
    catch { throw new Error('save'); }
  }
  return data;
}
// Calls back with the background's write-failure marker now and on every change. Returns an unsubscribe function.
export function watchLedgerError(callback) {
  let stop=()=>{}, live=true;
  import('wxt/browser').then(({browser})=>{
    if(!live) return;
    const listener=(changes,area)=>{ if(area==='local'&&LEDGER_ERROR_KEY in changes) callback(changes[LEDGER_ERROR_KEY].newValue); };
    browser.storage.onChanged.addListener(listener);
    stop=()=>browser.storage.onChanged.removeListener(listener);
    browser.storage.local.get(LEDGER_ERROR_KEY).then(stored=>{ if(live) callback(stored[LEDGER_ERROR_KEY]); });
  });
  return ()=>{ live=false; stop(); };
}

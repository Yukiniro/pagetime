import { blankData } from './model.mjs';
import { validateData } from './validate-data.mjs';
export const isExtension = ['chrome-extension:', 'moz-extension:'].includes(location.protocol);
export const palette = ['#2875ff','#20bfa5','#ffb32c','#8870ff','#20b5c7','#8d9ab2'];
export const knownSites = ['github.com','wxt.dev','developer.mozilla.org','youtube.com','notion.so'];
export const colorOf = domain => palette[knownSites.includes(domain)?knownSites.indexOf(domain):[...domain].reduce((n,c)=>(n+c.charCodeAt(0))%palette.length,0)];
const previewKey = 'pagetime-preview';
export async function command(type='snapshot') {
  if(isExtension){
    const {browser}=await import('wxt/browser');
    const response=await browser.runtime.sendMessage({type});
    if(response?.error) throw new Error(response.error);
    if(!response?.data) throw new Error('connect');
    return validateData(response.data);
  }
  let saved;
  try { saved=localStorage.getItem(previewKey); }
  catch { throw new Error('save'); }
  let data;
  try { data=saved===null?blankData():validateData(JSON.parse(saved)); }
  catch { throw new Error('data'); }
  if(type==='toggle') data.enabled=!data.enabled;
  if(type==='clear'){data.visits=[];data.spans=[];data.since=Date.now();}
  if(type!=='snapshot') {
    try { localStorage.setItem(previewKey,JSON.stringify(data)); }
    catch { throw new Error('save'); }
  }
  return data;
}

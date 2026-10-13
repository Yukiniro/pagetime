import { blankData } from './model.mjs';
export const isExtension = ['chrome-extension:', 'moz-extension:'].includes(location.protocol);
export const palette = ['#2875ff','#20bfa5','#ffb32c','#8870ff','#20b5c7','#8d9ab2'];
export const knownSites = ['github.com','wxt.dev','developer.mozilla.org','youtube.com','notion.so'];
export const colorOf = domain => palette[knownSites.includes(domain)?knownSites.indexOf(domain):[...domain].reduce((n,c)=>(n+c.charCodeAt(0))%palette.length,0)];
const previewKey = 'pagetime-preview';
export async function command(type='snapshot') {
  if(isExtension){
    const {browser}=await import('wxt/browser');
    const response=await browser.runtime.sendMessage({type});
    if(!response?.data||response.error) throw new Error(response?.error||'无法连接记录服务，请重新加载插件。');
    return response.data;
  }
  localStorage.removeItem('jilan-demo-v1');
  const saved=localStorage.getItem(previewKey);const data=saved?JSON.parse(saved):blankData();
  if(type==='toggle') data.enabled=!data.enabled;
  if(type==='clear'){data.visits=[];data.spans=[];data.since=Date.now();}
  localStorage.setItem(previewKey,JSON.stringify(data));return data;
}

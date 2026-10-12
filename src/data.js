import { blankData, addSpan, midnight } from './model.mjs';
export const isExtension = ['chrome-extension:', 'moz-extension:'].includes(location.protocol);
export const palette = ['#2875ff','#20bfa5','#ffb32c','#8870ff','#20b5c7','#8d9ab2'];
export const knownSites = ['github.com','wxt.dev','developer.mozilla.org','youtube.com','notion.so'];
export const colorOf = domain => palette[knownSites.includes(domain)?knownSites.indexOf(domain):[...domain].reduce((n,c)=>(n+c.charCodeAt(0))%palette.length,0)];
export function demoData() {
  const data=blankData();const day=midnight(Date.now());data.since=day-6*86_400_000;
  for(let offset=6;offset>=0;offset--){
    const date=new Date(day);date.setDate(date.getDate()-offset);
    let time=date.getTime()+8*3_600_000;
    for(let n=0;n<[18,12,16,22,14,19,17][offset];n++){
      const domain=knownSites[(n+offset)%5],minutes=7+((n*13+offset*7)%18);
      const end=offset===0?Math.min(Date.now(),time+minutes*60_000):time+minutes*60_000;
      if(time>=end) break;
      addSpan(data,domain,time,end);
      for(let count=0;count<2+n%3&&time+count*60_000<end;count++) data.visits.push({domain,at:time+count*60_000});
      time+=(minutes+11)*60_000;
    }
  }
  return data;
}
export async function command(type='snapshot') {
  if(isExtension){
    const {browser}=await import('wxt/browser');
    const response=await browser.runtime.sendMessage({type});
    if(!response?.data||response.error) throw new Error(response?.error||'无法连接记录服务，请重新加载插件。');
    return response.data;
  }
  const saved=localStorage.getItem('jilan-demo-v1');const data=saved?JSON.parse(saved):demoData();
  if(type==='toggle') data.enabled=!data.enabled;
  if(type==='clear'){data.visits=[];data.spans=[];data.since=Date.now();}
  localStorage.setItem('jilan-demo-v1',JSON.stringify(data));return data;
}

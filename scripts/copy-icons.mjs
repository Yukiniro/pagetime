import fs from 'node:fs/promises';
import {siGithub,siWxt,siMdnwebdocs,siYoutube,siNotion} from 'simple-icons';
const dir=new URL('../public/assets/',import.meta.url);await fs.mkdir(dir,{recursive:true});
for(const [domain,icon] of [['github.com',siGithub],['wxt.dev',siWxt],['developer.mozilla.org',siMdnwebdocs],['youtube.com',siYoutube],['notion.so',siNotion]]){
  await fs.writeFile(new URL(`${domain}.svg`,dir),icon.svg.replace('<svg ',`<svg fill="#${domain==='youtube.com'?'FF0000':'111827'}" `));
}

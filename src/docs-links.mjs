export const REPO_URL = 'https://github.com/Yukiniro/pagetime';

const doc = path => `${REPO_URL}/blob/main/${path}`;
const chinese = language => language === 'zh-CN' || language === 'zh-TW';

export function docLinks(language) {
  const zh = chinese(language);
  return {
    timing: doc(zh ? 'docs/timing.zh-CN.md' : 'docs/timing.md'),
    privacy: doc(zh ? 'PRIVACY.zh-CN.md' : 'PRIVACY.md'),
  };
}

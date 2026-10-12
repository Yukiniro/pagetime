import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  alias: { '@app': './src' },
  vite: () => ({
    plugins: [react(), tailwindcss()],
  }),
  webExt: { disabled: true },
  manifest: {
    name: 'PageTime',
    description: '本地记录网页访问、活跃浏览时长，查看站点排行与今日时间线。',
    permissions: ['storage', 'tabs', 'webNavigation', 'idle', 'alarms'],
    incognito: 'not_allowed',
    action: { default_title: '打开PageTime' },
  },
});

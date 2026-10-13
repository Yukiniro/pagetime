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
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'tabs', 'webNavigation', 'idle', 'alarms'],
    incognito: 'not_allowed',
    action: { default_title: '__MSG_actionTitle__' },
  },
});

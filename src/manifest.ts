import { defineManifest } from '@crxjs/vite-plugin';

const manifest = defineManifest({
  manifest_version: 3,
  name: 'Manaswap Wallet',
  short_name: 'Manaswap',
  description: 'High-performance Solana + X1 wallet with smart network detection.',
  version: '0.1.7',
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_title: 'Manaswap Wallet',
  },
  options_page: 'src/pages/options/index.html',
  background: {
    service_worker: 'src/extension/background.ts',
    type: 'module',
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  permissions: ['storage', 'tabs', 'scripting', 'activeTab', 'alarms'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/extension/content.ts'],
      run_at: 'document_start',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['assets/*.js', 'assets/*.css', 'assets/*.svg', 'assets/*.png'],
      matches: ['<all_urls>'],
    },
  ],
});

export default manifest;

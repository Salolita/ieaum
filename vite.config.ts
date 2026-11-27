import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pdfAssets } from './erae-tori/pdf-assets.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfAssets()],
  build: { rollupOptions: { input: { home: 'index.html', contact: 'contact/index.html', management: 'management/index.html', panel: 'panel/index.html', account: 'account/index.html', eraeTori: 'erae-tori/index.html', liveCodeAuth: 'live-code-auth/index.html', uniLudo: 'uni-ludo/index.html' } } },
});

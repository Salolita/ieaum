import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pdfAssets } from './erae-tori/pdf-assets.ts';

export default defineConfig({
  plugins: [react(), pdfAssets()],
  build: { rollupOptions: { input: { home: 'index.html', eraeTori: 'erae-tori/index.html' } } },
});

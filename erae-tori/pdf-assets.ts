import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export function pdfAssets(): Plugin {
  return {
    name: 'erae-pdf-assets',
    apply: 'build',
    generateBundle() {
      const root = createRequire(import.meta.url).resolve('pdfjs-dist/package.json');
      for (const dir of ['cmaps', 'standard_fonts', 'iccs', 'wasm']) {
        const sourceDir = join(root, '..', dir);
        for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          this.emitFile({ type: 'asset', fileName: `erae-tori/pdf/${dir}/${entry.name}`, source: readFileSync(join(sourceDir, entry.name)) });
        }
      }
    },
  };
}

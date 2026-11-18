import { build } from 'esbuild';
import { globSync } from 'node:fs';

// Commit the compiled files so consumers can pin this exact release without
// running installation scripts or fetching code at request time.
await build({
  entryPoints: ['portal/api/portal.ts', ...globSync('portal/server/*.ts'), 'portal/client/utils/entry.ts', 'portal/client/utils/quiz-time.ts'],
  outdir: 'portal/dist',
  outbase: 'portal',
  platform: 'node',
  format: 'esm',
  target: 'es2022',
});

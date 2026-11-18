import { build } from 'esbuild';
import { globSync } from 'node:fs';

// Commit the compiled files so consumers can pin this exact release without
// running installation scripts or fetching code at request time.
await build({
  entryPoints: [...globSync('portal/api/*.ts'), ...globSync('portal/server/*.ts'), ...globSync('portal/client/utils/{entry,quiz-time,jalali,erae-model}.ts')],
  outdir: 'portal/dist',
  outbase: 'portal',
  platform: 'node',
  format: 'esm',
  target: 'es2022',
});

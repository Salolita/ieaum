import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const file of globSync('portal/tests/*.mts')) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

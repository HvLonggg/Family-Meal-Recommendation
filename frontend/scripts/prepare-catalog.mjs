import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const script of [
  'sync-curated-recipes.mjs',
  'build-recipe-search-index.mjs',
  'verify-recipe-images.mjs',
]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(`./${script}`, import.meta.url))],
    { stdio: 'inherit' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sitemapPath = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));

for (const script of [
  'sync-curated-recipes.mjs',
  'build-recipe-search-index.mjs',
  'verify-recipe-images.mjs',
  'build-sitemap.mjs',
]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(`./${script}`, import.meta.url))],
    { stdio: 'inherit' },
  );

  const failed = Boolean(result.error) || result.status !== 0;
  // Sitemap chỉ phục vụ SEO: lỗi sinh lại không được chặn bản build, giữ public/sitemap.xml đã commit.
  if (failed && script === 'build-sitemap.mjs' && existsSync(sitemapPath)) {
    console.warn('build-sitemap failed; keeping the existing public/sitemap.xml.');
    continue;
  }
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

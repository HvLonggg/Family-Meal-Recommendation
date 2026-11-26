// Sinh public/sitemap.xml từ danh sách trang chính và toàn bộ món trong recipe-catalog.json.
// Mặc định đọc tệp catalog hiện có (chạy trong prebuild sau khi đồng bộ catalog).
// `--from-git` đọc bản đã commit (HEAD) để không phụ thuộc thay đổi cục bộ chưa commit.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_URL = 'https://bepviet-vn.vercel.app';
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(frontendRoot, 'public/data/recipe-catalog.json');
const outputPath = path.join(frontendRoot, 'public/sitemap.xml');

// Trang công khai được lập chỉ mục; trang tài khoản, quản trị và đăng nhập không đưa vào.
const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/recipes', priority: '0.9', changefreq: 'daily' },
  { path: '/meals', priority: '0.7', changefreq: 'weekly' },
  { path: '/random-meal', priority: '0.6', changefreq: 'weekly' },
  { path: '/planner', priority: '0.6', changefreq: 'weekly' },
  { path: '/suggestions', priority: '0.6', changefreq: 'weekly' },
  { path: '/nutrition', priority: '0.6', changefreq: 'weekly' },
  { path: '/articles', priority: '0.7', changefreq: 'weekly' },
  { path: '/contact', priority: '0.4', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
];

async function readCatalogText() {
  if (!process.argv.includes('--from-git')) return readFile(catalogPath, 'utf8');
  try {
    return execFileSync('git', ['show', 'HEAD:frontend/public/data/recipe-catalog.json'], {
      cwd: frontendRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Máy build không có git (hoặc bản clone nông thiếu HEAD): dùng tệp catalog đang có.
    return readFile(catalogPath, 'utf8');
  }
}

const escapeXml = (value) =>
  value.replace(
    /[<>&'"]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
  );

const catalog = JSON.parse(await readCatalogText());
const slugs = [
  ...new Set(
    (catalog.data ?? [])
      .map((recipe) => recipe.slug)
      .filter((slug) => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug))
      .filter((slug) => slug !== 'thit-kho-trung-qa'),
  ),
].sort();
if (slugs.length === 0) throw new Error('Catalog has no recipe slugs; refusing to write sitemap.');

const entries = [
  ...STATIC_ROUTES,
  ...slugs.map((slug) => ({
    path: `/recipes/${slug}`,
    priority: '0.8',
    changefreq: 'monthly',
  })),
];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(
    ({ path: route, priority, changefreq }) =>
      `  <url><loc>${escapeXml(`${SITE_URL}${route}`)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
  ),
  '</urlset>',
  '',
].join('\n');

await writeFile(outputPath, xml, 'utf8');
console.log(`sitemap.xml: ${entries.length} URLs (${slugs.length} recipes)`);

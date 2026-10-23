import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(frontendRoot, 'public');
const [catalogText, imageText] = await Promise.all([
  readFile(path.join(publicRoot, 'data/recipe-catalog.json'), 'utf8'),
  readFile(path.join(frontendRoot, 'src/data/recipeImageAssets.json'), 'utf8'),
]);
const catalog = JSON.parse(catalogText);
const imageAssets = JSON.parse(imageText);
const errors = [];
const slugs = new Set();

if (!Array.isArray(catalog.data) || catalog.total !== catalog.data.length) {
  errors.push('Catalog total does not match the number of published dishes.');
}

for (const recipe of catalog.data ?? []) {
  if (!recipe.slug || slugs.has(recipe.slug)) {
    errors.push(`${recipe.catalog_id ?? recipe.name}: missing or duplicate slug.`);
    continue;
  }
  slugs.add(recipe.slug);

  const assets = imageAssets[recipe.slug];
  if (!assets) {
    errors.push(`${recipe.catalog_id ?? recipe.slug}: no local image variants registered.`);
    continue;
  }

  const candidates = [recipe.image_path, assets.src, assets.master];
  for (const source of assets.srcSet?.split(',') ?? []) {
    candidates.push(source.trim().split(/\s+/)[0]);
  }

  for (const imagePath of new Set(candidates.filter(Boolean))) {
    if (!imagePath.startsWith('/')) {
      errors.push(`${recipe.catalog_id ?? recipe.slug}: image path must be local: ${imagePath}`);
      continue;
    }

    const absolutePath = path.resolve(publicRoot, imagePath.slice(1));
    if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
      errors.push(`${recipe.catalog_id ?? recipe.slug}: image path escapes public assets.`);
      continue;
    }

    try {
      await access(absolutePath);
      if ((await stat(absolutePath)).size === 0) {
        errors.push(`${recipe.catalog_id ?? recipe.slug}: image file is empty: ${imagePath}`);
      }
    } catch {
      errors.push(`${recipe.catalog_id ?? recipe.slug}: missing image file: ${imagePath}`);
    }
  }
}

for (const slug of Object.keys(imageAssets)) {
  if (!slugs.has(slug)) errors.push(`${slug}: image registry entry is not in the catalog.`);
}

if (errors.length) {
  console.error(`Recipe image audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Verified local images for all ${slugs.size} published Vietnamese dishes.`);
}

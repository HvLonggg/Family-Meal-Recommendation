import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(frontendRoot, '..');
const batchDirectory = path.join(projectRoot, 'backend/app/data/curated_recipe_batches');
const snapshotPath = path.join(frontendRoot, 'public/data/recipe-catalog.json');
const imageRegistryPath = path.join(frontendRoot, 'src/data/recipeImageAssets.json');
const translationPath = path.join(frontendRoot, 'src/features/i18n/recipeContent.en.json');

const [batchNames, snapshotText, imageText, translationText] = await Promise.all([
  readdir(batchDirectory).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }),
  readFile(snapshotPath, 'utf8'),
  readFile(imageRegistryPath, 'utf8'),
  readFile(translationPath, 'utf8'),
]);
const batches = batchNames
  .filter((name) => /^batch_\d+\.json$/.test(name))
  .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
const snapshot = JSON.parse(snapshotText);
const imageRegistry = JSON.parse(imageText);
const translations = JSON.parse(translationText);
snapshot.data = snapshot.data.filter((recipe) => recipe.slug !== 'thit-kho-trung-qa');
snapshot.total = snapshot.data.length;
const recipes = [];
const sidecars = new Map();

for (const filename of batches) {
  const batchNumber = Number(filename.match(/\d+/)?.[0]);
  const payload = JSON.parse(await readFile(path.join(batchDirectory, filename), 'utf8'));
  recipes.push(...payload.recipes);
  try {
    const sidecar = JSON.parse(
      await readFile(
        path.join(batchDirectory, `translations_${String(batchNumber).padStart(2, '0')}.en.json`),
        'utf8',
      ),
    );
    if (Array.isArray(sidecar.recipes)) {
      for (const recipe of sidecar.recipes) sidecars.set(recipe.id, recipe);
    } else {
      for (const [slug, recipe] of Object.entries(sidecar)) {
        if (recipe && typeof recipe === 'object') sidecars.set(slug, recipe);
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const expectedIds = recipes.map((recipe, index) => `BV${String(index + 331).padStart(3, '0')}`);
if (recipes.some((recipe, index) => recipe.id !== expectedIds[index])) {
  throw new Error('Curated batches must be contiguous from BV331 with no duplicate IDs.');
}
if (recipes.some((recipe) => !recipe.slug || !recipe.media?.[0]?.image_url)) {
  throw new Error('A curated recipe is missing its slug or image path.');
}

function stableUuid(value) {
  const bytes = createHash('sha1').update(`bepviet:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function recipeCategory(recipe) {
  const category = String(recipe.category ?? '').trim();
  const normalizedCategory = category.toLocaleLowerCase('vi');
  if (/chay/.test(normalizedCategory)) return 'Món chay';
  if (/tráng miệng|chè/.test(normalizedCategory)) return 'Món tráng miệng';
  if (/canh/.test(normalizedCategory)) return 'Món canh';
  if (/rau|nấm/.test(normalizedCategory)) return 'Món rau';
  if (/nước|bún|phở|mì|miến|cháo/.test(normalizedCategory)) return 'Món nước';
  if (/ăn sáng|cơm và xôi|bánh mì/.test(normalizedCategory)) return 'Món ăn sáng';
  if (/ăn kèm|nộm|gỏi|dưa muối|món cuốn/.test(normalizedCategory)) return 'Món ăn kèm';
  if (/ăn vặt|ăn nhẹ|bánh truyền thống|bánh và ăn vặt|món chiên|dân dã/.test(normalizedCategory))
    return 'Món ăn vặt';
  return 'Món mặn';
}

const ingredientGroups = {
  main: 'Nguyên liệu chính',
  protein: 'Nguyên liệu chính',
  fruit: 'Nguyên liệu chính',
  seaweed: 'Nguyên liệu chính',
  seed: 'Nguyên liệu chính',
  vegetable: 'Rau củ',
  seasoning: 'Gia vị',
  acid: 'Gia vị',
  sweetener: 'Gia vị',
  frying_oil: 'Gia vị',
  liquid: 'Nước và chất lỏng',
  process_aid: 'Hỗ trợ chế biến',
  aromatic: 'Gia vị',
  garnish: 'Rau thơm và phần ăn kèm',
  herb: 'Rau thơm và phần ăn kèm',
  accompaniment: 'Món ăn kèm',
  side: 'Món ăn kèm',
  topping: 'Rau thơm và phần ăn kèm',
  serving: 'Món ăn kèm',
  fat: 'Gia vị',
  grain: 'Nguyên liệu chính',
  other: 'Hỗ trợ chế biến',
  wrapping: 'Lá gói',
  wrapper: 'Lá gói',
};

function asApiRecipe(recipe) {
  const media = recipe.media[0];
  const grouped = new Map();
  recipe.ingredients.forEach((ingredient, index) => {
    const groupName = ingredientGroups[ingredient.role];
    if (!groupName) throw new Error(`${recipe.id}: unsupported ingredient role ${ingredient.role}.`);
    const items = grouped.get(groupName) ?? [];
    items.push({
      group_name: groupName,
      name: ingredient.name,
      amount: String(ingredient.quantity),
      unit: ingredient.unit,
      note: ingredient.notes ?? null,
      scalable: ingredient.scaling_rule !== 'vessel_dependent',
      position: ingredient.sequence ?? index + 1,
    });
    grouped.set(groupName, items);
  });

  return {
    id: stableUuid(recipe.slug),
    slug: recipe.slug,
    name: recipe.name,
    excerpt: recipe.finished_dish,
    region: recipe.region.length === 1 ? recipe.region[0] : 'Ba miền',
    category: recipeCategory(recipe),
    difficulty: recipe.difficulty,
    prep_minutes: recipe.prep_time,
    cook_minutes: recipe.cook_time,
    base_servings: recipe.servings,
    image_path: media.image_url,
    image_alt: media.alt_text ?? recipe.image_alt,
    catalog_id: recipe.id,
    content: { ...recipe, aliases: recipe.aliases ?? [], serving: recipe.serving },
    serving: recipe.serving,
    tip: recipe.tips.join('\n'),
    source_name: 'Bếp Việt',
    source_url: recipe.sources[0].url,
    ingredients: [...grouped.values()].flat(),
    steps: [
      ...recipe.preparation_steps.map((step) => ({
        step_type: 'so_che',
        content: step.instruction,
        position: step.step,
      })),
      ...recipe.cooking_steps.map((step) => ({
        step_type: 'thuc_hien',
        content: step.instruction,
        position: step.step,
      })),
    ],
  };
}

function addTranslation(source, english) {
  if (typeof source === 'string' && typeof english === 'string') {
    if (source.trim() && english.trim() && source.trim() !== english.trim()) {
      translations[source.trim()] ??= english.trim();
    }
    return;
  }
  if (Array.isArray(source) && Array.isArray(english)) {
    source.forEach((value, index) => addTranslation(value, english[index]));
  }
}

function mergeTranslation(source, english) {
  if (!english) return;
  for (const key of [
    'name',
    'aliases',
    'category',
    'description',
    'serving_basis',
    'finished_dish',
    'serving',
    'image_alt',
    'time_note',
    'difficulty',
    'recipe_family',
  ]) {
    addTranslation(source[key], english[key]);
  }
  for (const key of [
    'region',
    'province',
    'meal_type',
    'dish_type',
    'main_ingredient',
    'cooking_method',
    'search_terms',
    'suggested_pairings',
    'keywords',
    'tips',
  ]) {
    addTranslation(source[key], english[key]);
  }
  source.ingredients.forEach((ingredient, index) => {
    const translated = english.ingredients?.[index];
    if (!translated) return;
    if (Array.isArray(translated)) {
      addTranslation(ingredient.name, translated[0]);
      addTranslation(ingredient.unit, translated[1]);
      addTranslation(ingredient.notes, translated[2]);
    } else {
      addTranslation(ingredient.name, translated.name);
      addTranslation(ingredient.unit, translated.unit);
      addTranslation(ingredient.notes, translated.notes);
    }
  });
  for (const key of ['preparation_steps', 'cooking_steps']) {
    source[key].forEach((step, index) => addTranslation(step.instruction, english[key]?.[index]));
  }
  const sourceTags = source.tags ?? {};
  const englishTags = english.tags ?? {};
  for (const [key, value] of Object.entries(sourceTags)) addTranslation(value, englishTags[key]);
}

const existingIds = new Set(snapshot.data.map((recipe) => recipe.catalog_id).filter(Boolean));
const existingIndexById = new Map(
  snapshot.data.flatMap((recipe, index) =>
    recipe.catalog_id ? [[recipe.catalog_id, index]] : [],
  ),
);
const catalogIdSet = new Set(recipes.map((recipe) => recipe.id));
const missingEarlier = [...catalogIdSet].filter((id) => Number(id.slice(2)) < 496 && !existingIds.has(id));
if (missingEarlier.length) {
  throw new Error(`The snapshot is missing earlier curated recipes: ${missingEarlier.slice(0, 8).join(', ')}.`);
}

let added = 0;
let updated = 0;
for (const recipe of recipes) {
  if (Number(recipe.id.slice(2)) < 496) continue;
  mergeTranslation(recipe, sidecars.get(recipe.id) ?? sidecars.get(recipe.slug));

  const imageBase = recipe.media[0].image_url.replace(/-(?:480|960|1536|1600|3840)\.webp$/, '');
  const availableVariants = [];
  for (const width of [480, 960, 1536, 3840]) {
    const imagePath = `${imageBase}-${width}.webp`;
    try {
      await stat(path.join(frontendRoot, 'public', imagePath.replace(/^\//, '')));
      availableVariants.push({ imagePath, width });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  for (const requiredWidth of [480, 960]) {
    if (!availableVariants.some((variant) => variant.width === requiredWidth)) {
      throw new Error(`${recipe.id}: missing required ${requiredWidth}px image variant.`);
    }
  }
  const image = {
    src: availableVariants.find((variant) => variant.width === 960).imagePath,
    srcSet: availableVariants.map((variant) => `${variant.imagePath} ${variant.width}w`).join(', '),
    master: availableVariants.at(-1).imagePath,
    alt: recipe.media[0].alt_text ?? recipe.image_alt,
  };
  imageRegistry[recipe.slug] = image;
  const row = asApiRecipe(recipe);
  const existingIndex = existingIndexById.get(recipe.id);
  if (existingIndex === undefined) {
    snapshot.data.push(row);
    existingIndexById.set(recipe.id, snapshot.data.length - 1);
    existingIds.add(recipe.id);
    added += 1;
  } else {
    snapshot.data[existingIndex] = row;
    updated += 1;
  }
}

for (const recipe of snapshot.data) {
  if (imageRegistry[recipe.slug] || !recipe.image_path?.startsWith('/images/')) continue;
  const imageBase = recipe.image_path.replace(/-(?:480|960|1536|1600|3840)\.webp$/, '');
  const variants = [];
  for (const width of [480, 960, 1536, 1600, 3840]) {
    const src = `${imageBase}-${width}.webp`;
    try {
      await stat(path.join(frontendRoot, 'public', src.replace(/^\//, '')));
      variants.push({ src, width });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const imageExists = variants.length > 0
    ? true
    : await stat(path.join(frontendRoot, 'public', recipe.image_path.replace(/^\//, '')))
        .then(() => true)
        .catch((error) => {
          if (error?.code === 'ENOENT') return false;
          throw error;
        });
  if (!imageExists) continue;
  imageRegistry[recipe.slug] = {
    src: variants.find((variant) => variant.width === 960)?.src ?? variants[0]?.src ?? recipe.image_path,
    ...(variants.length > 1
      ? { srcSet: variants.map((variant) => `${variant.src} ${variant.width}w`).join(', ') }
      : {}),
    master:
      variants.find((variant) => variant.width === 3840)?.src ??
      variants.find((variant) => variant.width === 1600)?.src ??
      variants.find((variant) => variant.width === 1536)?.src ??
      variants.find((variant) => variant.width === 960)?.src ??
      recipe.image_path,
    alt: recipe.image_alt,
  };
}

snapshot.data.sort((left, right) => {
  const leftId = left.catalog_id ? Number(left.catalog_id.slice(2)) : Number.MAX_SAFE_INTEGER;
  const rightId = right.catalog_id ? Number(right.catalog_id.slice(2)) : Number.MAX_SAFE_INTEGER;
  return leftId - rightId || left.name.localeCompare(right.name, 'vi');
});
snapshot.total = snapshot.data.length;

await Promise.all([
  writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`, 'utf8'),
  writeFile(imageRegistryPath, `${JSON.stringify(imageRegistry, null, 2)}\n`, 'utf8'),
  writeFile(translationPath, `${JSON.stringify(translations, null, 2)}\n`, 'utf8'),
]);
console.log(`Synchronized ${added} new and ${updated} existing curated recipes into the fallback catalog.`);

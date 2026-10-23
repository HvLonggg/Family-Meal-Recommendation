import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(frontendRoot, 'public/data/recipe-catalog.json');
const dictionaryPath = path.join(frontendRoot, 'src/features/i18n/recipeContent.en.json');
const frontendOutput = path.join(frontendRoot, 'src/data/recipeSearchEnglish.json');
const backendOutput = path.resolve(frontendRoot, '../backend/app/data/recipe-search-en.json');

const [snapshotText, dictionaryText] = await Promise.all([
  readFile(snapshotPath, 'utf8'),
  readFile(dictionaryPath, 'utf8'),
]);
const snapshot = JSON.parse(snapshotText);
const dictionary = JSON.parse(dictionaryText);

function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

function translate(value) {
  return dictionary[value?.trim()] ?? value;
}

function recipeIngredients(recipe) {
  return (recipe.ingredients ?? []).flatMap((entry) =>
    Array.isArray(entry.items)
      ? entry.items.map((item) => ({ ...item, group_name: entry.group_name }))
      : [entry],
  );
}

const index = {};
for (const recipe of snapshot.data) {
  const content = recipe.content ?? {};
  const ingredientItems = recipeIngredients(recipe);
  const names = [...new Set([recipe.name, ...(content.aliases ?? [])].map(translate).filter(Boolean))];
  const sourceFields = [
    recipe.excerpt,
    recipe.region,
    recipe.category,
    recipe.difficulty,
    `${recipe.prep_minutes + recipe.cook_minutes + (content.passive_time ?? 0)} phút`,
    `${recipe.prep_minutes + recipe.cook_minutes + (content.passive_time ?? 0)} minutes`,
    content.region,
    content.province,
    content.aliases,
    content.description,
    content.finished_dish,
    content.serving,
    content.serving_basis,
    content.time_note,
    content.search_terms,
    content.main_ingredient,
    content.cooking_method,
    content.dish_type,
    content.suggested_pairings,
    content.keywords,
    content.tips,
    content.tags,
    ingredientItems.map((item) => [item.group_name, item.name, item.unit]),
  ];
  const ingredientTerms = [...new Set(
    ingredientItems.map((item) => translate(item.name)).filter(Boolean),
  )];
  const fields = [...new Set(stringsIn(sourceFields).map(translate).filter(Boolean))];
  index[recipe.slug] = { names, ingredients: ingredientTerms, fields };
}

const output = `${JSON.stringify(index)}\n`;
const outputPaths = [frontendOutput];
try {
  await access(path.dirname(backendOutput));
  outputPaths.push(backendOutput);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await Promise.all(outputPaths.map((outputPath) => writeFile(outputPath, output, 'utf8')));
console.log(`Indexed English search terms for ${Object.keys(index).length} recipes.`);

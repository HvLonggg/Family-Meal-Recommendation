import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getRecipe, recipes, recipeText, setRecipeDictionary } from '@/data/recipes';
import dictionary from '@/features/i18n/recipeContent.en.json';
import { applyRecipeLanguage } from '@/features/i18n/recipeContent';

const english = dictionary as Record<string, string>;
const catalogSnapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/recipe-catalog.json'), 'utf8'),
) as { data: Array<Record<string, unknown>> };
const projectImageAssets = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/data/recipeImageAssets.json'), 'utf8'),
) as Record<string, { alt: string }>;

function collectCatalogText(recipe: Record<string, unknown>) {
  const content = recipe.content as Record<string, unknown> | undefined;
  const ingredients = recipe.ingredients as Array<Record<string, unknown>>;
  const steps = recipe.steps as Array<Record<string, unknown>>;
  const texts = [
    recipe.name,
    recipe.excerpt,
    recipe.image_alt,
    recipe.serving,
    recipe.tip,
    content?.serving_basis,
    content?.finished_dish,
    content?.category,
    ...((content?.tips as string[] | undefined) ?? []),
    ...ingredients.flatMap((item) => [item.group_name, item.name, item.unit, item.note]),
    ...steps.map((step) => step.content),
  ];
  return texts.filter((text): text is string => typeof text === 'string' && text.trim().length > 0);
}

describe('recipe content localization', () => {
  afterEach(() => setRecipeDictionary(null));

  it('translates names, descriptions, ingredients and tips for every bundled recipe', () => {
    const missing = recipes
      .flatMap((recipe) => [
        recipe.name,
        recipe.excerpt,
        recipe.imageAlt,
        ...recipe.ingredients.flatMap((group) => [
          group.group,
          ...group.items.flatMap((item) => [item.name, item.unit, item.note ?? '']),
        ]),
        ...recipe.preparation,
        ...recipe.cooking,
        recipe.serving,
        recipe.finishedDish ?? '',
        recipe.servingBasis ?? '',
        ...(recipe.tips ?? [recipe.tip]),
      ])
      .filter((text) => text && !(text.trim() in english));
    expect(missing).toEqual([]);
  });

  it('has English copy for every user-facing text field in the current API catalog', () => {
    const missing = Array.from(
      new Set(catalogSnapshot.data.flatMap(collectCatalogText).map((text) => text.trim())),
    ).filter((text) => !(text in english));
    expect(missing).toEqual([]);
  });

  it('has English alt text for every project food image', () => {
    const missing = Object.values(projectImageAssets)
      .map(({ alt }) => alt.trim())
      .filter((text) => !(text in english));
    expect(missing).toEqual([]);
  });

  it('swaps the catalog to English and back without losing Vietnamese search aliases', async () => {
    const slug = recipes[0]!.slug;
    const sourceRecipe = getRecipe(slug)!;
    const vietnameseName = sourceRecipe.name;

    await applyRecipeLanguage('en');
    const translated = getRecipe(slug)!;
    expect(translated.name).toBe(english[vietnameseName]);
    expect(translated.aliases).toContain(vietnameseName);
    expect(translated.preparation).toEqual(sourceRecipe.preparation.map((step) => english[step]));
    expect(translated.cooking).toEqual(sourceRecipe.cooking.map((step) => english[step]));
    expect(recipeText('Nước mắm')).toBe('Fish sauce');

    await applyRecipeLanguage('vi');
    expect(getRecipe(slug)!.name).toBe(vietnameseName);
    expect(getRecipe(slug)!.preparation).toEqual(sourceRecipe.preparation);
    expect(getRecipe(slug)!.cooking).toEqual(sourceRecipe.cooking);
    expect(recipeText('Nước mắm')).toBe('Nước mắm');
  });

  it('keeps Vietnamese text when a translation is missing', () => {
    setRecipeDictionary(english);
    expect(recipeText('Món chưa có bản dịch')).toBe('Món chưa có bản dịch');
  });
});

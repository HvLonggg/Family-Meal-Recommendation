import { describe, expect, it } from 'vitest';

import { matchesRecipeSearch } from '@/data/recipeSearch';
import { getRecipe, recipeMinutes, recipes } from '@/data/recipes';
import { matchesSearch } from '@/lib/search';

describe('Vietnamese recipe search', () => {
  it('matches accented and unaccented keywords with repeated whitespace', () => {
    const recipe = getRecipe('rau-muong-xao-toi')!;
    expect(matchesRecipeSearch(recipe, '  RAU   muong  TOI  ')).toBe(true);
    expect(matchesRecipeSearch(recipe, 'rau muống tỏi')).toBe(true);
  });

  it('finds ingredients that are absent from the recipe name', () => {
    expect(matchesRecipeSearch(getRecipe('ca-chep-kho-rieng')!, 'lá trà xanh')).toBe(true);
    expect(matchesRecipeSearch(getRecipe('rau-muong-xao-toi')!, 'lá trà xanh')).toBe(false);
  });

  it('requires every keyword and avoids matching cá to canh', () => {
    expect(matchesSearch('cá', ['Canh rau ngót'])).toBe(false);
    expect(matchesSearch('ca kho', ['Cá chép kho riềng'])).toBe(true);
    expect(matchesSearch('rau tôm', ['Rau muống xào tỏi'])).toBe(false);
    expect(matchesSearch('bun cha', ['Bún tươi', 'Lá chanh'])).toBe(false);
  });

  it('returns no invented results and supports the existing time suggestion', () => {
    expect(recipes.filter((recipe) => matchesRecipeSearch(recipe, 'khôngcómónnày'))).toEqual([]);
    expect(
      recipes.filter((recipe) => matchesRecipeSearch(recipe, '15 phút')).map((r) => r.slug),
    ).toEqual(recipes.filter((recipe) => recipeMinutes(recipe) <= 15).map((r) => r.slug));
  });

  it('filters semantic food topics against recipe attributes', () => {
    const vegetarian = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'Món chay'));
    const light = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'Món thanh đạm'));
    const seafood = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'món hải sản'));

    expect(vegetarian.length).toBeGreaterThan(0);
    expect(
      vegetarian.every(
        (recipe) => recipe.category === 'Món chay' || recipe.tags.includes('Món chay'),
      ),
    ).toBe(true);
    expect(light.length).toBeGreaterThan(0);
    expect(
      light.every((recipe) => ['Món canh', 'Món rau', 'Món chay'].includes(recipe.category)),
    ).toBe(true);
    expect(seafood.length).toBeGreaterThan(0);
    expect(seafood.some((recipe) => recipe.slug === 'canh-chua-ca')).toBe(true);
    expect(seafood.some((recipe) => recipe.slug === 'dau-hu-sot-ca-chua')).toBe(false);
    expect(matchesRecipeSearch(getRecipe('canh-chua-ca')!, 'mon hai san')).toBe(true);
    expect(
      matchesRecipeSearch(
        { ...getRecipe('dau-hu-sot-ca-chua')!, name: 'Đậu phụ chấm mắm tôm' },
        'Món hải sản',
      ),
    ).toBe(false);
  });

  it('filters cooking time phrases and combines them with food topics', () => {
    expect(recipes.filter((recipe) => matchesRecipeSearch(recipe, 'nấu trong 30p'))).toEqual(
      recipes.filter((recipe) => recipeMinutes(recipe) <= 30),
    );
    expect(recipes.filter((recipe) => matchesRecipeSearch(recipe, 'nau trong 30p'))).toEqual(
      recipes.filter((recipe) => recipeMinutes(recipe) <= 30),
    );
    const quickVegetarian = recipes.filter((recipe) =>
      matchesRecipeSearch(recipe, 'món chay dưới 30 phút'),
    );
    expect(quickVegetarian.length).toBeGreaterThan(0);
    expect(
      quickVegetarian.every(
        (recipe) => recipe.category === 'Món chay' && recipeMinutes(recipe) <= 30,
      ),
    ).toBe(true);
  });

  it('filters suggestion topics by dish type, ingredient, skill and region', () => {
    const soups = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'Món canh'));
    const chicken = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'Món gà'));
    const easy = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'Món dễ nấu'));
    const northern = recipes.filter((recipe) => matchesRecipeSearch(recipe, 'Món miền Bắc'));

    expect(soups.length).toBeGreaterThan(0);
    expect(soups.every((recipe) => recipe.category === 'Món canh')).toBe(true);
    expect(chicken.length).toBeGreaterThan(0);
    expect(
      chicken.every((recipe) =>
        matchesSearch('gà', [
          recipe.name,
          ...recipe.ingredients.flatMap((group) =>
            group.items.map((ingredient) => ingredient.name),
          ),
        ]),
      ),
    ).toBe(true);
    expect(easy.length).toBeGreaterThan(0);
    expect(easy.every((recipe) => recipe.difficulty === 'Dễ')).toBe(true);
    expect(northern.length).toBeGreaterThan(0);
    expect(
      northern.every((recipe) => matchesSearch('Bắc', [recipe.region, ...(recipe.regions ?? [])])),
    ).toBe(true);
  });
});

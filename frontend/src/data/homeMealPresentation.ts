import type { Recipe } from '@/data/recipes';
import type { Translate } from '@/features/i18n/I18nContext';

export function resolveHomeMealRecipes(slugs: string[], catalog: Recipe[]): Recipe[] {
  const bySlug = new Map(catalog.map((recipe) => [recipe.slug, recipe]));
  return [...new Set(slugs)].flatMap((slug) => {
    const recipe = bySlug.get(slug);
    return recipe ? [recipe] : [];
  });
}

export function describeHomeMeal(
  items: Pick<Recipe, 'slug' | 'name'>[],
  translate: Translate,
  locale: string,
): string {
  if (!items.length) return '';

  const dishes = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    items.map((recipe) => recipe.name),
  );
  const signature = items
    .map((recipe) => recipe.slug)
    .sort((left, right) => left.localeCompare(right))
    .join('|');
  const variant =
    Array.from(signature).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;
  const summaries = [
    translate('Mâm gồm {dishes}, đủ vị bữa cơm.', { dishes }),
    translate('{dishes} tạo mâm cơm hài hòa.', { dishes }),
    translate('Kết hợp {dishes}, vừa đủ vị nhà.', { dishes }),
    translate('Dọn {dishes}, tròn vị bữa cơm.', { dishes }),
  ];
  return `${summaries[variant]!}.`;
}

import type { Recipe } from '@/data/recipes';
import type { Translate } from '@/features/i18n/I18nContext';

const summaryTemplates = [
  'Kết hợp {dishes} cho bữa cơm nhà.',
  'Lên mâm cùng {dishes}.',
  '{dishes} — trọn vị cơm nhà.',
] as const;

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

  const signature = items.map((recipe) => recipe.slug).join('|');
  const variant = Array.from(signature).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  const dishes = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    items.map((recipe) => recipe.name),
  );
  return translate(summaryTemplates[variant % summaryTemplates.length]!, { dishes });
}

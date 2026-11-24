import type { Recipe } from '@/data/recipes';
import { normalizeSearchText } from '@/lib/search';

export function isVegetarianRecipe(recipe: Recipe) {
  return (
    recipe.category === 'Món chay' ||
    recipe.tags.some((tag) => /^(mon chay|chay|vegetarian|vegan)$/.test(normalizeSearchText(tag)))
  );
}

export function isVegetableDish(recipe: Recipe) {
  const name = normalizeSearchText(recipe.slug);
  if (/\b(nhoi|cuon)\b/.test(name)) return recipe.category === 'Món rau';
  return (
    recipe.category === 'Món rau' ||
    (/^(rau|cai|bap cai|bong|hoa thien ly|su su|su hao|mong toi|ngon|dot|bau|bi|muop|kho qua|mang|nam|dau que|dau dua|dau bap|dau rong|ca tim|cu sen|cu cai|bon bon|ngo non|bap non)( |$)/.test(
      name,
    ) &&
      /\b(xao|luoc|hap|tron|nuong|goi|nom)\b/.test(name))
  );
}

export function isSoupDish(recipe: Recipe) {
  return (
    recipe.category === 'Món canh' || /^(canh|sup|soup)( |$)/.test(normalizeSearchText(recipe.slug))
  );
}

export function getCatalogCategory(recipe: Recipe): Recipe['category'] {
  if (recipe.category === 'Món chay') return 'Món chay';
  if (isSoupDish(recipe)) return 'Món canh';
  if (recipe.category === 'Món mặn' && isVegetableDish(recipe)) return 'Món rau';
  if (recipe.category === 'Món mặn' && isVegetarianRecipe(recipe)) return 'Món chay';
  return recipe.category;
}

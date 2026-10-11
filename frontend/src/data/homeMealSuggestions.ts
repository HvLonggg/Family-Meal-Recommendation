import { recipeMinutes, type Recipe } from '@/data/recipes';
import { describeMealComposition } from '@/data/mealComposition';

export type HomeMealSuggestion = {
  id: string;
  title: string;
  description: string;
  time: string;
  minutes: number;
  servings: number;
  recipeSlugs: string[];
  /** Dữ liệu cấu trúc để giao diện tự dịch tiêu đề và mô tả. */
  anchorName?: string;
};

function pickRecipe(candidates: Recipe[], index: number, excluded: Set<string>) {
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(index + offset) % candidates.length];
    if (candidate && !excluded.has(candidate.slug)) return candidate;
  }
  return undefined;
}

export function createHomeMealSuggestions(catalog: Recipe[]): HomeMealSuggestion[] {
  if (!catalog.length) return [];

  const mains = catalog.filter((recipe) => ['Món mặn', 'Món chay'].includes(recipe.category));
  const soups = catalog.filter((recipe) => recipe.category === 'Món canh');
  const vegetables = catalog.filter(
    (recipe) => recipe.category === 'Món rau' || recipe.category === 'Món ăn kèm',
  );
  const fallback = catalog;

  return catalog.map((anchor, index) => {
    const selected = new Set<string>();
    const isMain = ['Món mặn', 'Món chay'].includes(anchor.category);
    const isSoup = anchor.category === 'Món canh';
    const isVegetable = ['Món rau', 'Món ăn kèm'].includes(anchor.category);
    const main = isMain ? anchor : pickRecipe(mains.length ? mains : fallback, index, selected);
    if (main) selected.add(main.slug);
    const soup = isSoup ? anchor : pickRecipe(soups.length ? soups : fallback, index, selected);
    if (soup) selected.add(soup.slug);
    const vegetable = isVegetable
      ? anchor
      : pickRecipe(vegetables.length ? vegetables : fallback, index, selected);
    if (vegetable) selected.add(vegetable.slug);

    // Keep breakfast and dessert recipes discoverable in the full-catalog meal carousel too.
    if (!selected.has(anchor.slug)) selected.add(anchor.slug);

    const mealRecipes = [...selected]
      .map((slug) => catalog.find((recipe) => recipe.slug === slug))
      .filter((recipe): recipe is Recipe => Boolean(recipe));
    const time = Math.max(...mealRecipes.map(recipeMinutes));
    return {
      id: `goi-y-${anchor.slug}`,
      title: `Mâm cơm cùng ${anchor.name}`,
      description: describeMealComposition(mealRecipes),
      time: `${time} phút`,
      minutes: time,
      anchorName: anchor.name,
      servings: anchor.servings,
      recipeSlugs: mealRecipes.map((recipe) => recipe.slug),
    };
  });
}

import type { Recipe } from '@/data/recipes';

type MealComponent = Pick<Recipe, 'category' | 'name' | 'slug'>;

export function describeMealComposition(items: MealComponent[]) {
  const main = items.find((item) => ['Món mặn', 'Món chay'].includes(item.category));
  const soup = items.find((item) => item.category === 'Món canh');
  const vegetable = items.find(
    (item) => item.category === 'Món rau' || item.category === 'Món ăn kèm',
  );

  if (main && soup && vegetable) {
    const coreSlugs = new Set([main.slug, soup.slug, vegetable.slug]);
    const extras = items.filter((item) => !coreSlugs.has(item.slug)).map((item) => item.name);
    const extraPhrase = extras.length ? `, thêm ${extras.join(', ')}` : '';
    const balancePhrase =
      vegetable.category === 'Món rau' ? 'món chính, canh và rau' : 'món chính, canh và món ăn kèm';
    return `Kết hợp ${main.name} với ${soup.name} và ${vegetable.name}${extraPhrase} để bữa cơm cân bằng giữa ${balancePhrase}.`;
  }

  return `Kết hợp ${items.map((item) => item.name).join(', ')} cho mâm cơm đủ vị.`;
}

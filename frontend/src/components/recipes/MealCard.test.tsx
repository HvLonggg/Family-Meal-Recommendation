import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { MealCard } from '@/components/recipes/MealCard';
import { getMealRole } from '@/data/mealComposition';
import { getMealRecipes, mealSets } from '@/data/recipes';

const meal = mealSets[0]!;
const dishes = getMealRecipes(meal.recipeSlugs);

afterEach(cleanup);

describe('suggested meal platter', () => {
  it('shows every dish together on a full tray and links each photo to its detail', () => {
    render(
      <MemoryRouter>
        <MealCard meal={meal} />
      </MemoryRouter>,
    );

    const platter = screen.getByRole('region', {
      name: `Mâm cơm gợi ý: ${new Intl.ListFormat('vi', { style: 'long', type: 'conjunction' }).format(dishes.map((dish) => dish.name))}`,
    });
    const dishLinks = within(platter).getAllByRole('link');
    expect(dishLinks).toHaveLength(dishes.length);
    expect(within(platter).getAllByRole('img')).toHaveLength(dishes.length);
    for (const dish of dishes) {
      expect(
        within(platter).getByRole('link', { name: `Xem chi tiết món ${dish.name}` }),
      ).toHaveAttribute('href', `/recipes/${dish.slug}`);
    }
    expect(within(platter).getByText(`${dishes.length} món`)).toBeInTheDocument();
    const summary = document.querySelector('.meal-card__summary > p')?.textContent ?? '';
    expect(summary.length).toBeLessThan(dishes.map((dish) => dish.name).join(', ').length + 50);
    for (const dish of dishes) expect(summary).toContain(dish.name);
  });

  it('names a suggested meal after its main dish even when another dish anchored it', () => {
    const soup = dishes.find((dish) => getMealRole(dish) === 'soup')!;
    const main = dishes.find((dish) => getMealRole(dish) === 'main')!;
    render(
      <MemoryRouter>
        <MealCard
          meal={{
            ...meal,
            id: `goi-y-${soup.slug}`,
            anchorName: soup.name,
            recipeSlugs: [soup.slug, main.slug],
          }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: `Mâm cơm cùng ${main.name}` }),
    ).toBeInTheDocument();
  });

  it('lets the visitor highlight a dish without hiding the rest of the meal', () => {
    render(
      <MemoryRouter>
        <MealCard meal={meal} />
      </MemoryRouter>,
    );
    const platter = screen.getByRole('region', {
      name: `Mâm cơm gợi ý: ${new Intl.ListFormat('vi', { style: 'long', type: 'conjunction' }).format(dishes.map((dish) => dish.name))}`,
    });

    fireEvent.click(
      screen.getByRole('button', { name: `Làm nổi bật ${dishes[2]!.name} trên mâm` }),
    );
    expect(
      screen.getByRole('button', { name: `Làm nổi bật ${dishes[2]!.name} trên mâm` }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(platter).getAllByRole('link')).toHaveLength(dishes.length);
    expect(within(platter).getByText(dishes[2]!.name)).toBeInTheDocument();
  });
});

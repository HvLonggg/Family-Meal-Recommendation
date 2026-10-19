import { describe, expect, it } from 'vitest';

import { recipes } from '@/data/recipes';
import {
  buildRecipeScript,
  detectNarrationLang,
  splitIntoChunks,
  toSpokenText,
} from '@/features/narration/recipeScript';

describe('toSpokenText', () => {
  it('reads units, ranges, fractions and temperatures aloud', () => {
    expect(toSpokenText('Thêm 500g thịt, 200 ml nước')).toBe(
      'Thêm 500 gam thịt, 200 mi li lít nước',
    );
    expect(toSpokenText('Nướng 180°C trong 10-15 phút')).toBe(
      'Nướng 180 độ C trong 10 đến 15 phút',
    );
    expect(toSpokenText('Dùng 1/2 quả chanh, khúc 40 cm')).toBe(
      'Dùng 1 phần 2 quả chanh, khúc 40 xăng ti mét',
    );
  });

  it('does not touch Vietnamese words that start like a unit', () => {
    expect(toSpokenText('Cho 2 gói gia vị và 1 lá chanh')).toBe('Cho 2 gói gia vị và 1 lá chanh');
  });
});

describe('splitIntoChunks', () => {
  it('keeps every chunk short enough for speech engines', () => {
    const long = `${'Đảo đều tay cho thịt săn lại, '.repeat(12)}rồi tắt bếp. Nêm lại cho vừa ăn.`;
    const chunks = splitIntoChunks(long, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long.trim().replace(/\s+/g, ' '));
  });
});

describe('buildRecipeScript', () => {
  const recipe = recipes[0]!;

  it('narrates intro, ingredients, every step and tips in page order', () => {
    const script = buildRecipeScript(recipe, recipe.servings);
    const sections = [...new Set(script.map((segment) => segment.section))];
    expect(sections[0]).toBe('intro');
    expect(sections).toContain('ingredients');
    expect(sections.indexOf('preparation')).toBeLessThan(sections.indexOf('cooking'));
    expect(sections.at(-1)).toBe('tips');
    recipe.cooking.forEach((_, index) => {
      expect(script.some((segment) => segment.anchor === `cooking-${index}`)).toBe(true);
    });
  });

  it('reads ingredient amounts for the chosen servings', () => {
    const doubled = buildRecipeScript(recipe, recipe.servings * 2);
    expect(
      doubled.some((segment) => segment.text === `Nguyên liệu cho ${recipe.servings * 2} người.`),
    ).toBe(true);
  });
});

describe('English narration', () => {
  const recipe = recipes[0]!;

  it('speaks English labels and keeps untranslated Vietnamese steps on a Vietnamese voice', () => {
    const script = buildRecipeScript(recipe, recipe.servings, 'en');
    const step = script.findIndex((segment) => segment.text === 'Step 1.');
    expect(script[step]?.lang).toBe('en-US');
    expect(script[step + 1]?.lang).toBe('vi-VN');
    expect(script.find((segment) => segment.section === 'ingredients')?.text).toBe(
      `Ingredients for ${recipe.servings} people.`,
    );
  });

  it('reads English units aloud', () => {
    expect(toSpokenText('Add 500g pork and 2 tbsp sauce, 180°C', 'en-US')).toBe(
      'Add 500 grams pork and 2 tablespoons sauce, 180 degrees Celsius',
    );
  });

  it('detects Vietnamese text by its diacritics', () => {
    expect(detectNarrationLang('Rửa sạch cá', 'en')).toBe('vi-VN');
    expect(detectNarrationLang('Wash the fish', 'en')).toBe('en-US');
    expect(detectNarrationLang('Wash the fish', 'vi')).toBe('vi-VN');
  });
});

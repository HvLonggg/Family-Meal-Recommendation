import { describe, expect, it } from 'vitest';

import {
  formatIngredientQuantity,
  isGenericIngredientNote,
  isGenericServingBasis,
} from '@/lib/recipeDisplay';

const vi = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('vi-VN', options).format(value);
const en = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('en-US', options).format(value);

describe('ingredient quantity display', () => {
  it('switches large weights and volumes to kg and litres with a Vietnamese decimal comma', () => {
    expect(formatIngredientQuantity(1200, 'g', vi)).toBe('1,2 kg');
    expect(formatIngredientQuantity(3500, 'ml', vi)).toBe('3,5 lít');
    expect(formatIngredientQuantity(1000, 'g', vi)).toBe('1 kg');
    expect(formatIngredientQuantity(3500, 'ml', en, 'en')).toBe('3.5 L');
  });

  it('rounds grams sensibly and keeps other units unchanged', () => {
    expect(formatIngredientQuantity(37.5, 'g', vi)).toBe('38 g');
    expect(formatIngredientQuantity(2.5, 'g', vi)).toBe('2,5 g');
    expect(formatIngredientQuantity(1.5, 'muỗng canh', vi)).toBe('1,5 muỗng canh');
  });

  it('hides boilerplate notes and serving text repeated across the catalog', () => {
    expect(
      isGenericIngredientNote(
        'Nguyên liệu chính; cân phần dùng được trừ khi ghi nguyên vỏ/có xương.',
      ),
    ).toBe(true);
    expect(isGenericIngredientNote('Seasoning; starting amount, taste once cooked.')).toBe(true);
    expect(isGenericIngredientNote('Để riêng cho mỗi người tự thêm độ cay.')).toBe(false);
    expect(
      isGenericServingBasis(
        '4 người lớn; món cùng cơm là phần dùng chung trong mâm 3–4 món, món bún/cơm/cháo là 4 phần chính.',
      ),
    ).toBe(true);
    expect(isGenericServingBasis('4 tô bún đầy đủ, mỗi người lớn một tô.')).toBe(false);
  });
});

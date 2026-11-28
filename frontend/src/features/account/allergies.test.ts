import { describe, expect, it } from 'vitest';

import { joinAllergies, parseAllergies } from '@/features/account/allergies';

describe('allergy chips', () => {
  it('splits saved free text on commas, semicolons and “và”', () => {
    expect(parseAllergies('tôm, cua và đậu phộng; Sữa')).toEqual([
      'tôm',
      'cua',
      'đậu phộng',
      'Sữa',
    ]);
    expect(parseAllergies('')).toEqual([]);
  });

  it('keeps slashes inside a chip and removes duplicates', () => {
    expect(parseAllergies('mè/vừng, Tôm, tôm ,  ')).toEqual(['mè/vừng', 'Tôm']);
  });

  it('joins chips back into the comma separated format the assistant parses', () => {
    expect(joinAllergies(['tôm', 'hải sản có vỏ', 'tôm'])).toBe('tôm, hải sản có vỏ');
    expect(joinAllergies(parseAllergies('tôm và cua'))).toBe('tôm, cua');
  });
});

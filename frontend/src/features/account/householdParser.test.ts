import { describe, expect, it } from 'vitest';

import { parseHouseholdDescription } from '@/features/account/householdParser';
import { householdPortions, recommendedServings } from '@/features/account/preferences';

const servingsFor = (text: string) =>
  recommendedServings({
    household_members: parseHouseholdDescription(text),
    servings_mode: 'auto',
    manual_servings: 4,
  });

describe('parseHouseholdDescription', () => {
  it('reads two sisters with their ages', () => {
    const members = parseHouseholdDescription('2 chị em 25 và 22 tuổi');
    expect(members.map((member) => member.label).sort()).toEqual(['Chị', 'Em']);
    expect(members.map((member) => member.age).sort()).toEqual([22, 25]);
    expect(servingsFor('2 chị em 25 và 22 tuổi')).toBe(2);
  });

  it('reads a small family with a 12 year old child', () => {
    const members = parseHouseholdDescription('Gia đình nhỏ 3 người: 2 bố mẹ và bạn nhỏ 12 tuổi');
    expect(members).toEqual([
      { label: 'Bố', age: 40, appetite: 'normal' },
      { label: 'Mẹ', age: 38, appetite: 'normal' },
      { label: 'Bé', age: 12, appetite: 'normal' },
    ]);
    expect(householdPortions(members)).toBeCloseTo(2.7);
    expect(servingsFor('Gia đình nhỏ 3 người: 2 bố mẹ và bạn nhỏ 12 tuổi')).toBe(3);
  });

  it('expands counted roles and fills missing members from the total', () => {
    const members = parseHouseholdDescription('nhà 5 người, 3 con 5, 8 và 10 tuổi');
    expect(members).toHaveLength(5);
    expect(members.slice(0, 3).map((member) => member.age)).toEqual([5, 8, 10]);
  });

  it('returns an empty list when nothing can be understood', () => {
    expect(parseHouseholdDescription('ăn uống lành mạnh')).toEqual([]);
  });
});

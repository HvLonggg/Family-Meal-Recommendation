import { describe, expect, it } from 'vitest';

import { canonicalPath } from '@/app/router/legacyRoutes';

describe('canonical route migration', () => {
  it.each([
    ['/ke-hoach', '/planner'],
    ['/mon-an/bun-cha-ha-noi', '/recipes/bun-cha-ha-noi'],
    ['/dat-lai-mat-khau', '/reset-password'],
    ['/recipes/bun-cha-ha-noi', '/recipes/bun-cha-ha-noi'],
  ])('preserves the recipe identifier when migrating %s', (input, expected) => {
    expect(canonicalPath(input)).toBe(expected);
  });
});

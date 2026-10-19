import { describe, expect, it } from 'vitest';

import { seededShuffle } from '@/lib/seededShuffle';

const items = Array.from({ length: 40 }, (_, index) => ({ slug: `mon-${index}` }));
const key = (item: { slug: string }) => item.slug;

describe('seededShuffle', () => {
  it('keeps every item and is stable for the same seed', () => {
    const first = seededShuffle(items, 'seed-a:user-1', key);
    expect(first).toHaveLength(items.length);
    expect(new Set(first.map(key))).toEqual(new Set(items.map(key)));
    expect(seededShuffle(items, 'seed-a:user-1', key)).toEqual(first);
  });

  it('produces a different order for a new visit or another account', () => {
    const order = (seed: string) => seededShuffle(items, seed, key).map(key).join();
    expect(order('seed-a:user-1')).not.toBe(order('seed-b:user-1'));
    expect(order('seed-a:user-1')).not.toBe(order('seed-a:user-2'));
    expect(order('seed-a:user-1')).not.toBe(items.map(key).join());
  });

  it('orders by key so translated copies keep the same position', () => {
    const translated = items.map((item) => ({ ...item, name: `Dish ${item.slug}` }));
    expect(seededShuffle(translated, 'seed', key).map(key)).toEqual(
      seededShuffle(items, 'seed', key).map(key),
    );
  });
});

import { describe, expect, it } from 'vitest';

import { monotonePath, niceTicks, percentChange } from './chartMath';

describe('chartMath', () => {
  it('builds nice axis ticks', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(95)).toEqual([0, 50, 100]);
  });

  it('computes change versus the previous period', () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(3, 0)).toBeNull();
  });

  it('keeps the monotone curve within the data range', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([{ x: 0, y: 5 }])).toBe('M0,5');
    const path = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
    ]);
    const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10);
  });
});

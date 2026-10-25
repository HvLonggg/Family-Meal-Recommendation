import { afterEach, describe, expect, it, vi } from 'vitest';

import { fitDishCutout } from '@/lib/fitDishCutout';

function createImage() {
  const image = document.createElement('img');
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: 1536 },
    naturalHeight: { value: 864 },
    clientWidth: { value: 142 },
    clientHeight: { value: 100 },
  });
  return image;
}

function alphaContent(top: number, bottom: number) {
  const data = new Uint8ClampedArray(48 * 48 * 4);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 16; x <= 31; x += 1) data[(y * 48 + x) * 4 + 3] = 255;
  }
  return data;
}

afterEach(() => vi.restoreAllMocks());

describe('fitDishCutout', () => {
  it('balances a small cutout to the same visible frame without cropping it', () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: alphaContent(12, 29) })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    const image = createImage();
    fitDishCutout(image);

    const scale = Number(image.style.getPropertyValue('--dish-content-scale'));
    expect(scale).toBeGreaterThan(2.28);
    expect(scale).toBeLessThan(2.31);
    expect(
      Number.parseFloat(image.style.getPropertyValue('--dish-content-offset-y')),
    ).toBeGreaterThan(0);
    expect(image.style.getPropertyValue('--dish-content-offset-y')).toMatch(/%$/);
  });

  it('leaves opaque photos at their original scale', () => {
    const data = new Uint8ClampedArray(48 * 48 * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

    const image = createImage();
    image.style.setProperty('--dish-content-scale', '1.7');
    image.style.setProperty('--dish-content-offset-x', '12px');
    fitDishCutout(image);

    expect(image.style.getPropertyValue('--dish-content-scale')).toBe('');
    expect(image.style.getPropertyValue('--dish-content-offset-x')).toBe('');
  });
});

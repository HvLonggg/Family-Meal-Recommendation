import { afterEach, describe, expect, it, vi } from 'vitest';

import { fitDishCutout } from '@/lib/fitDishCutout';

function createImage(naturalWidth = 1536, naturalHeight = 864, width = 142, height = 100) {
  const image = document.createElement('img');
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: naturalWidth },
    naturalHeight: { value: naturalHeight },
    clientWidth: { value: width },
    clientHeight: { value: height },
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
  it.each([
    { label: 'wide plate', width: 1600, height: 400, left: 2, top: 20, right: 45, bottom: 27 },
    { label: 'tall bowl', width: 400, height: 1600, left: 20, top: 2, right: 27, bottom: 45 },
  ])(
    'keeps the complete $label inside its frame',
    ({ width, height, left, top, right, bottom }) => {
      const pixels = new Uint8ClampedArray(48 * 48 * 4);
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) pixels[(y * 48 + x) * 4 + 3] = 255;
      }
      const context = {
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixels })),
      } as unknown as CanvasRenderingContext2D;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);

      const image = createImage(width, height, 200, 200);
      fitDishCutout(image);

      const scale = Number(image.style.getPropertyValue('--dish-content-scale'));
      // The visible plate spans 44 of 48 samples along the 200px fitted edge.
      expect((44 / 48) * 200 * scale).toBeLessThanOrEqual(180.1);
      expect((44 / 48) * 200 * scale).toBeGreaterThan(179);
      expect(Number.parseFloat(image.style.getPropertyValue('--dish-content-offset-x'))).toBe(0);
      expect(Number.parseFloat(image.style.getPropertyValue('--dish-content-offset-y'))).toBe(0);
    },
  );

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

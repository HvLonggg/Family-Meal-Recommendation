import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Typewriter } from './Typewriter';

let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function advance(milliseconds: number) {
  const end = now + milliseconds;
  while (now < end) {
    now = Math.min(end, now + 16);
    const pending = frames;
    frames = [];
    act(() => pending.forEach((callback) => callback(now)));
  }
}

it('reveals characters one by one without a blinking caret, full text for screen readers', () => {
  const { container } = render(<Typewriter delay={100} speed={10} text="Bếp Việt" />);
  const shown = () => container.querySelectorAll('.typewriter__char.is-shown').length;
  expect(container.querySelector('.visually-hidden')?.textContent).toBe('Bếp Việt');
  expect(container.querySelectorAll('.typewriter__char')).toHaveLength(8);
  expect(shown()).toBe(0);

  advance(100 + 16 + 30);
  expect(shown()).toBeGreaterThan(0);
  expect(shown()).toBeLessThan(8);

  advance(1000);
  expect(shown()).toBe(8);
  expect(container.querySelector('.typewriter__caret')).toBeNull();
});

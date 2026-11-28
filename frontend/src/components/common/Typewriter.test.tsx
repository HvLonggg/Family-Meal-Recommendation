import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { Typewriter } from './Typewriter';

afterEach(() => {
  vi.useRealTimers();
});

it('types the text gradually while screen readers get the whole sentence', () => {
  vi.useFakeTimers();
  const { container } = render(<Typewriter delay={100} speed={10} text="Bếp Việt" />);
  expect(container.querySelector('.visually-hidden')?.textContent).toBe('Bếp Việt');
  expect(container.querySelector('.typewriter__rest')?.textContent).toBe('Bếp Việt');

  act(() => {
    vi.advanceTimersByTime(130);
  });
  expect(container.querySelector('.typewriter__rest')?.textContent).toBe(' Việt');

  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(container.querySelector('.typewriter__rest')?.textContent).toBe('');
  expect(container.querySelector('.typewriter__caret')).toBeNull();
});

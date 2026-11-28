import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { Typewriter } from './Typewriter';

it('renders every character once with a staggered CSS delay, full text for screen readers', () => {
  const { container } = render(<Typewriter delay={100} speed={10} text="Bếp Việt vui" />);
  const root = container.querySelector<HTMLElement>('.typewriter')!;
  expect(container.querySelector('.visually-hidden')?.textContent).toBe('Bếp Việt vui');
  expect(root.style.getPropertyValue('--tw-delay')).toBe('100ms');
  expect(root.style.getPropertyValue('--tw-speed')).toBe('10ms');

  const chars = [...container.querySelectorAll<HTMLElement>('.typewriter__char')];
  expect(chars.map((char) => char.textContent).join('')).toBe('BếpViệtvui');
  // Khoảng trắng chiếm một nhịp: "Việt" bắt đầu ở nhịp 4, "vui" ở nhịp 9.
  expect(chars.map((char) => char.style.getPropertyValue('--i'))).toEqual([
    '0',
    '1',
    '2',
    '4',
    '5',
    '6',
    '7',
    '9',
    '10',
    '11',
  ]);
  expect(container.querySelector('.typewriter__caret')).toBeNull();
});

it('keeps each word in one wrapper so it never breaks mid-word', () => {
  const { container } = render(<Typewriter text="Cùng Bếp Việt," />);
  const words = [...container.querySelectorAll('.typewriter__word')];
  expect(words.map((word) => word.textContent)).toEqual(['Cùng', 'Bếp', 'Việt,']);
});

it('does not re-render or schedule frames while revealing', () => {
  const frames = vi.spyOn(window, 'requestAnimationFrame');
  render(<Typewriter text="Bếp Việt" />);
  expect(frames).not.toHaveBeenCalled();
  frames.mockRestore();
});

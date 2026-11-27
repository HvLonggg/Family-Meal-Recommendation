import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShowcaseCarousel } from '@/components/recipes/ShowcaseCarousel';
import { setRecipeCatalogSource } from '@/data/recipes';

const items = Array.from({ length: 7 }, (_, index) => ({
  id: `item-${index + 1}`,
  name: `Món ${index + 1}`,
}));

let frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
let currentTime = 0;

function renderCarousel(bleed = false) {
  return render(
    <ShowcaseCarousel
      bleed={bleed}
      getKey={(item) => item.id}
      items={items}
      label="Món ăn"
      renderItem={(item) => <h3>{item.name}</h3>}
    />,
  );
}

// Khớp HOVER_PAUSE_DELAY trong ShowcaseCarousel.
const HOVER_PAUSE_DELAY = 3000;

function advanceFrames(milliseconds: number) {
  const endTime = currentTime + milliseconds;
  while (currentTime < endTime) {
    currentTime = Math.min(currentTime + 16, endTime);
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    act(() => callbacks.forEach((callback) => callback(currentTime)));
  }
}

beforeEach(() => {
  setRecipeCatalogSource('online');
  vi.useFakeTimers();
  frameCallbacks = new Map();
  nextFrameId = 0;
  currentTime = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frameCallbacks.delete(id));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('showcase carousel', () => {
  it('shows placeholder cards instead of bundled dishes while the catalog loads', () => {
    setRecipeCatalogSource('loading');
    const { container } = renderCarousel();
    expect(screen.queryByText('Món 1')).toBeNull();
    expect(container.querySelectorAll('.catalog-skeleton-card').length).toBeGreaterThan(0);
    act(() => setRecipeCatalogSource('online'));
    expect(screen.getAllByText('Món 1').length).toBeGreaterThan(0);
  });

  it('can extend the recommendation rail to the section edges', () => {
    renderCarousel(true);
    expect(document.querySelector('.showcase-carousel--bleed')).toBeInTheDocument();
  });

  it('keeps three cards visible and moves one card smoothly when an arrow is clicked', () => {
    renderCarousel();
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Món 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Món 3' })).toBeInTheDocument();
    expect(document.querySelector('.showcase-carousel__arrow--previous')).toBeInTheDocument();
    expect(document.querySelector('.showcase-carousel__arrow--next')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Món ăn tiếp' }));
    advanceFrames(300);
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    expect(track?.style.transform).not.toBe('translate3d(0, 0, 0)');
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();
    advanceFrames(650);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Món ăn trước' }));
    advanceFrames(950);
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();
  });

  it('slides the previous item in from the left with the same eased motion', () => {
    renderCarousel();
    fireEvent.click(screen.getByRole('button', { name: 'Món ăn trước' }));

    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    expect(track?.style.transform).toMatch(/translate3d\(-\d+(\.\d+)?px, 0, 0\)/);
    advanceFrames(300);
    expect(track?.style.transform).toMatch(/translate3d\(-\d+(\.\d+)?px, 0, 0\)/);
    advanceFrames(650);
    expect(screen.getByText('Món ăn 7–2 / 7')).toBeInTheDocument();
  });

  it('moves continuously at an even pace without waiting between dishes', () => {
    renderCarousel();
    const carousel = screen.getByRole('region', { name: 'Món ăn' });
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');

    fireEvent.mouseEnter(carousel);
    advanceFrames(2_000);
    const transformAfterTwoSeconds = track?.style.transform;
    expect(transformAfterTwoSeconds).toMatch(/translate3d\(-\d+(\.\d+)?px, 0, 0\)/);
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();

    advanceFrames(8_500);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
    expect(track?.style.transform).not.toBe('translate3d(0, 0, 0)');
    advanceFrames(10_500);
    expect(screen.getByText('Món ăn 3–5 / 7')).toBeInTheDocument();
  });

  it('runs only while visible, pauses offscreen and resumes on re-entry', () => {
    const intersections: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
    class MockIntersectionObserver {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        intersections.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });

    renderCarousel();
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    const initialTransform = track?.style.transform;
    advanceFrames(12_000);
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();
    expect(track?.style.transform).toBe(initialTransform);

    act(() => intersections[0]?.([{ isIntersecting: true }]));
    const carousel = screen.getByRole('region', { name: 'Món ăn' });
    fireEvent.mouseEnter(carousel);
    advanceFrames(11_000);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
    const visibleTransform = track?.style.transform;

    act(() => intersections[0]?.([{ isIntersecting: false }]));
    advanceFrames(20_000);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
    expect(track?.style.transform).toBe(visibleTransform);

    act(() => intersections[0]?.([{ isIntersecting: true }]));
    advanceFrames(11_000);
    expect(screen.getByText('Món ăn 3–5 / 7')).toBeInTheDocument();
    expect(track?.style.transform).not.toBe(visibleTransform);
  });

  it('pauses automatic motion during keyboard focus and resumes after focus leaves', () => {
    renderCarousel();
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    const next = screen.getByRole('button', { name: 'Món ăn tiếp' });
    vi.spyOn(next, 'matches').mockReturnValue(true);
    advanceFrames(2_000);
    const transformBeforeFocus = track?.style.transform;
    fireEvent.focus(next);
    advanceFrames(15_000);
    expect(track?.style.transform).toBe(transformBeforeFocus);
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();
    fireEvent.blur(next, { relatedTarget: document.body });
    advanceFrames(11_000);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
    expect(track?.style.transform).not.toBe(transformBeforeFocus);
  });

  it('keeps moving while the mouse only passes over the rail', () => {
    const carousel = renderCarousel().getByRole('region', { name: 'Món ăn' });
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    advanceFrames(1_000);
    fireEvent.pointerEnter(carousel, { pointerType: 'mouse' });
    const transformOnEnter = track?.style.transform;
    act(() => {
      vi.advanceTimersByTime(HOVER_PAUSE_DELAY - 500);
    });
    advanceFrames(1_000);
    expect(track?.style.transform).not.toBe(transformOnEnter);
    fireEvent.pointerLeave(carousel, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(HOVER_PAUSE_DELAY);
    });
    const transformAfterLeave = track?.style.transform;
    advanceFrames(1_000);
    expect(track?.style.transform).not.toBe(transformAfterLeave);
  });

  it('pauses once the mouse rests on the rail for 3 seconds and resumes when it leaves', () => {
    const carousel = renderCarousel().getByRole('region', { name: 'Món ăn' });
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    advanceFrames(1_000);
    fireEvent.pointerEnter(carousel, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(HOVER_PAUSE_DELAY);
    });
    const transformOnHover = track?.style.transform;
    advanceFrames(15_000);
    expect(track?.style.transform).toBe(transformOnHover);
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();

    fireEvent.pointerLeave(carousel, { pointerType: 'mouse' });
    advanceFrames(11_000);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
  });

  it('holds still while a finger touches the rail', () => {
    const carousel = renderCarousel().getByRole('region', { name: 'Món ăn' });
    const track = document.querySelector<HTMLElement>('.showcase-carousel__track');
    fireEvent.pointerDown(carousel, { pointerType: 'touch', clientX: 120 });
    const transformOnTouch = track?.style.transform;
    advanceFrames(15_000);
    expect(track?.style.transform).toBe(transformOnTouch);
    fireEvent.pointerUp(carousel, { pointerType: 'touch', clientX: 120 });
    advanceFrames(11_000);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
  });

  it('announces the position only after the user presses an arrow', () => {
    renderCarousel();
    const status = screen.getByText('Món ăn 1–3 / 7');
    expect(status).toHaveAttribute('aria-live', 'off');
    advanceFrames(11_000);
    expect(screen.getByText('Món ăn 2–4 / 7')).toHaveAttribute('aria-live', 'off');

    fireEvent.click(screen.getByRole('button', { name: 'Món ăn tiếp' }));
    advanceFrames(950);
    expect(screen.getByText('Món ăn 3–5 / 7')).toHaveAttribute('aria-live', 'polite');
  });

  it('supports a touch swipe while allowing automatic motion to continue', () => {
    const carousel = renderCarousel().getByRole('region', { name: 'Món ăn' });
    fireEvent.pointerDown(carousel, { pointerType: 'touch', clientX: 180 });
    fireEvent.pointerUp(carousel, { pointerType: 'touch', clientX: 105 });
    advanceFrames(950);
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
    advanceFrames(10_500);
    expect(screen.getByText('Món ăn 3–5 / 7')).toBeInTheDocument();
  });

  it('keeps automatic movement off for reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderCarousel();
    advanceFrames(20_000);
    expect(screen.getByText('Món ăn 1–3 / 7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Món ăn tiếp' }));
    expect(screen.getByText('Món ăn 2–4 / 7')).toBeInTheDocument();
  });
});

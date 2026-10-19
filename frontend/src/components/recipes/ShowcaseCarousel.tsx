import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';

type ShowcaseCarouselProps<Item> = {
  bleed?: boolean;
  getKey: (item: Item) => string;
  items: Item[];
  label: string;
  renderItem: (item: Item) => ReactNode;
};

type Direction = 'next' | 'previous';

const CARD_GAP = 22;
const AUTO_SPEED = 40;
const MANUAL_DURATION = 900;

function visibleCardsForWidth(width: number) {
  if (width < 680) return 1;
  if (width < 960) return 2;
  return 3;
}

function slideStep(width: number, visibleCount: number) {
  return (width + CARD_GAP) / visibleCount;
}

function modulo(value: number, length: number) {
  return ((value % length) + length) % length;
}

export function ShowcaseCarousel<Item>({
  bleed = false,
  getKey,
  items,
  label,
  renderItem,
}: ShowcaseCarouselProps<Item>) {
  const { t } = useI18n();
  const initialWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const [visibleCount, setVisibleCount] = useState(() => visibleCardsForWidth(initialWidth));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInView, setIsInView] = useState(
    () => typeof window === 'undefined' || typeof IntersectionObserver === 'undefined',
  );
  const [manualDirection, setManualDirection] = useState<Direction | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [trackOffset, setTrackOffset] = useState(0);
  const carouselRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const stepRef = useRef(slideStep(initialWidth, visibleCardsForWidth(initialWidth)));
  const swipeStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const carousel = carouselRef.current;
    if (!carousel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '48px 0px', threshold: 0.01 },
    );
    observer.observe(carousel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.('change', updatePreference);
    return () => media.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = (updateRender = false) => {
      const nextWidth = visibleCardsForWidth(window.innerWidth);
      const width = viewport.clientWidth || window.innerWidth;
      setVisibleCount(nextWidth);
      stepRef.current = slideStep(width, nextWidth);
      offsetRef.current %= stepRef.current;
      if (updateRender) setTrackOffset(offsetRef.current);
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(-${offsetRef.current}px, 0, 0)`;
      }
    };

    measure();
    const onResize = () => measure(true);
    window.addEventListener('resize', onResize);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure(true));
    observer?.observe(viewport);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (
      items.length < 2 ||
      (manualDirection === null && (items.length <= visibleCount || !isInView || reducedMotion))
    ) {
      return;
    }

    let animationFrame = 0;
    let previousTime: number | null = null;
    let manualStartTime: number | null = null;
    const destination = manualDirection === 'next' ? stepRef.current : 0;
    const start = offsetRef.current;

    const animate = (time: number) => {
      if (manualDirection) {
        if (manualStartTime === null) manualStartTime = time;
        const progress = Math.min(1, (time - manualStartTime) / MANUAL_DURATION);
        const eased = progress * progress * (3 - 2 * progress);
        offsetRef.current = start + (destination - start) * eased;
        if (progress >= 1) {
          offsetRef.current = 0;
          // Đổi thẻ và vị trí cùng lúc để tránh nháy thẻ cũ.
          flushSync(() => {
            setTrackOffset(0);
            setCurrentIndex((index) =>
              modulo(index + (manualDirection === 'next' ? 1 : -1), items.length),
            );
            setManualDirection(null);
          });
          if (trackRef.current) {
            trackRef.current.style.transform = 'translate3d(0, 0, 0)';
          }
          return;
        }
      } else if (previousTime !== null) {
        const elapsed = Math.min(time - previousTime, 50);
        offsetRef.current += (elapsed * AUTO_SPEED) / 1000;
        if (offsetRef.current >= stepRef.current) {
          const passedCards = Math.floor(offsetRef.current / stepRef.current);
          offsetRef.current -= passedCards * stepRef.current;
          flushSync(() => {
            setTrackOffset(offsetRef.current);
            setCurrentIndex((index) => modulo(index + passedCards, items.length));
          });
        }
      }

      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(-${offsetRef.current}px, 0, 0)`;
      }
      previousTime = time;
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, items.length, manualDirection, reducedMotion, visibleCount]);

  const canMove = items.length > visibleCount;
  // Giữ hai thẻ đệm để tải ảnh trước khi chúng vào khung nhìn.
  const renderedCount = Math.min(items.length, visibleCount + (canMove ? 2 : 0));
  const firstItemIndex = currentIndex + (manualDirection === 'previous' ? -1 : 0);
  const renderedItems = Array.from({ length: renderedCount }, (_, index) => {
    const absoluteIndex = firstItemIndex + index;
    return items[modulo(absoluteIndex, items.length)]!;
  });
  const shownStart = items.length ? currentIndex + 1 : 0;
  const shownEnd = items.length ? modulo(currentIndex + visibleCount - 1, items.length) + 1 : 0;

  const move = (direction: Direction) => {
    if (!canMove || manualDirection) return;
    if (reducedMotion) {
      setCurrentIndex((index) => modulo(index + (direction === 'next' ? 1 : -1), items.length));
      offsetRef.current = 0;
      setTrackOffset(0);
      return;
    }
    if (direction === 'previous') {
      // Thêm thẻ trước vào đầu và trượt về vị trí gốc.
      offsetRef.current = stepRef.current + offsetRef.current;
    }
    setTrackOffset(offsetRef.current);
    setManualDirection(direction);
  };

  return (
    <section
      aria-label={label}
      aria-roledescription={t('băng chuyền món ăn')}
      className={`showcase-carousel${bleed ? ' showcase-carousel--bleed' : ''}`}
      ref={carouselRef}
      onPointerDown={(event) => {
        swipeStartXRef.current = event.pointerType === 'touch' ? event.clientX : null;
      }}
      onPointerUp={(event) => {
        const startX = swipeStartXRef.current;
        swipeStartXRef.current = null;
        if (startX === null || Math.abs(event.clientX - startX) < 55) return;
        move(event.clientX < startX ? 'next' : 'previous');
      }}
      onPointerCancel={() => {
        swipeStartXRef.current = null;
      }}
    >
      <div aria-live="polite" className="showcase-carousel__status">
        {label} {shownStart}–{shownEnd} / {items.length}
      </div>
      <div className="showcase-carousel__stage">
        <button
          aria-label={t('{label} trước', { label })}
          className="showcase-carousel__arrow showcase-carousel__arrow--previous"
          disabled={!canMove || manualDirection !== null}
          onClick={() => move('previous')}
          type="button"
        >
          <AppIcon name="arrow" size={19} />
        </button>
        <div className="showcase-carousel__viewport" ref={viewportRef}>
          <div
            className="showcase-carousel__track"
            data-visible-count={visibleCount}
            ref={trackRef}
            style={{ transform: `translate3d(-${trackOffset}px, 0, 0)` }}
          >
            {renderedItems.map((item) => (
              <div className="showcase-carousel__item" key={getKey(item)}>
                {renderItem(item)}
              </div>
            ))}
          </div>
        </div>
        <button
          aria-label={t('{label} tiếp', { label })}
          className="showcase-carousel__arrow showcase-carousel__arrow--next"
          disabled={!canMove || manualDirection !== null}
          onClick={() => move('next')}
          type="button"
        >
          <AppIcon name="arrow" size={19} />
        </button>
      </div>
    </section>
  );
}

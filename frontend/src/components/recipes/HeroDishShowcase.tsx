import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { formatMinutes, getRecipe, recipeMinutes, recipes, type Recipe } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';

const FIRST_SWITCH_MS = 2000;
const SWITCH_MS = 4200;
const LEAVE_MS = 900;
const IMAGE_SIZES = '(min-width: 1320px) 600px, (min-width: 960px) 45vw, 90vw';
const STEAM_WISPS = 8;

// Loại món nguội khỏi hiệu ứng hơi nóng.
const COLD_DISHES = new Set(['thit-dong', 'gio-thu', 'thit-heo-ngam-nuoc-mam']);

/** Chọn món có ảnh tách nền cho hero. */
function showcaseDishes() {
  const cutouts = recipes.filter(
    (recipe) =>
      recipe.image.startsWith('/images/recipes/edited/') &&
      recipe.category !== 'Món tráng miệng' &&
      !COLD_DISHES.has(recipe.slug),
  );
  return cutouts.length > 0 ? cutouts : recipes.slice(0, 1);
}

function pickNext(pool: Recipe[], current: number, recent: number[]) {
  if (pool.length < 2) return current;
  const candidates = pool
    .map((_, index) => index)
    .filter((index) => index !== current && !recent.includes(index));
  const options = candidates.length > 0 ? candidates : pool.map((_, index) => index);
  return options[Math.floor(Math.random() * options.length)]!;
}

/** Tải và giải mã ảnh trước khi đổi món để không bị nháy trống. */
function preload(recipe: Recipe) {
  const image = new Image();
  image.sizes = IMAGE_SIZES;
  if (recipe.imageSrcSet) image.srcset = recipe.imageSrcSet;
  image.src = recipe.image;
  return image.decode().catch(() => undefined);
}

function prefersReducedMotion() {
  if (document.documentElement.dataset.reduceMotion === 'true') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function HeroDishShowcase() {
  const { t } = useI18n();
  const [pool] = useState(showcaseDishes);
  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const recent = useRef<number[]>([]);
  const [switchCount, setSwitchCount] = useState(0);

  useEffect(() => {
    if (paused || pool.length < 2 || prefersReducedMotion()) return;
    let cancelled = false;
    const delay = switchCount === 0 ? FIRST_SWITCH_MS : SWITCH_MS;
    const timer = window.setTimeout(() => {
      const next = pickNext(pool, current, recent.current);
      void preload(pool[next]!).then(() => {
        if (cancelled || document.hidden) return;
        recent.current = [current, ...recent.current].slice(0, Math.min(6, pool.length - 2));
        setSwitchCount((count) => count + 1);
        setLeaving(current);
        setCurrent(next);
      });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [current, paused, pool, switchCount]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // Lấy lại từ danh mục để tên món đổi theo ngôn ngữ đang chọn.
  const dish = getRecipe(pool[current]!.slug) ?? pool[current]!;
  const layers = leaving === null || leaving === current ? [current] : [leaving, current];

  return (
    <div
      className="hero-dish"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span aria-hidden="true" className="hero-dish__glow" />
      <div className="hero-dish__stage">
        <span aria-hidden="true" className="hero-dish__shadow" />
        {layers.map((index) => {
          const recipe = pool[index]!;
          const isLeaving = index !== current;
          return (
            <img
              alt={isLeaving ? '' : recipe.imageAlt}
              aria-hidden={isLeaving || undefined}
              className={`hero-dish__plate ${isLeaving ? 'is-leaving' : switchCount > 0 ? 'is-entering' : ''}`}
              decoding="async"
              fetchPriority={index === 0 ? 'high' : undefined}
              key={recipe.slug}
              sizes={IMAGE_SIZES}
              src={recipe.image}
              srcSet={recipe.imageSrcSet}
            />
          );
        })}
        <div aria-hidden="true" className="hero-dish__steam">
          {Array.from({ length: STEAM_WISPS }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>

      <Link
        aria-label={t('Xem chi tiết {name}', { name: dish.name })}
        className="hero-float hero-float--top"
        to={`/recipes/${dish.slug}`}
      >
        <span>{t('Thực đơn gợi ý')}</span>
        <strong aria-live="polite" className="hero-float__swap" key={dish.slug}>
          {dish.name}
        </strong>
      </Link>
      <div className="hero-float hero-float--bottom">
        <span className="hero-float__icon">
          <AppIcon name="clock" />
        </span>
        <div className="hero-float__swap" key={dish.slug}>
          <strong>{formatMinutes(recipeMinutes(dish), t)}</strong>
          <small>{t('Khẩu phần {count} người', { count: dish.servings })}</small>
        </div>
      </div>
    </div>
  );
}

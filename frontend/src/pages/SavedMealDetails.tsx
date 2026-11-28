import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { fitDishPlate, guessDishPlateKind } from '@/components/recipes/dishPlate';
import { dishImage } from '@/data/dishImages';
import { formatDuration } from '@/data/nutritionEstimate';
import {
  calculateMealStats,
  dishName,
  formatSavedMealTime,
  roleDetails,
  type MealSlot,
  type SavedRandomMeal,
} from '@/data/randomMeals';
import { getRecipe } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Mâm thu nhỏ: các món xếp vòng quanh tâm mâm, cùng cỡ đĩa với mâm chính. */
export function SavedMealTray({ slots, size }: { slots: MealSlot[]; size: 'sm' | 'lg' }) {
  const count = slots.length;
  return (
    <span
      aria-hidden="true"
      className={`saved-tray saved-tray--${size}`}
      style={{ '--saved-tray-dish': count > 4 ? '36%' : '42%' } as CSSProperties}
    >
      {slots.map((slot, index) => {
        const radians = (index * 2 * Math.PI) / count;
        const dish = slot.dish!;
        return (
          <span
            className="saved-tray__dish dish-plate dish-plate--uniform"
            data-dish-kind={guessDishPlateKind(dish.sourceKey, dish.image)}
            key={dish.id}
            style={{
              left: `${50 + Math.sin(radians) * 27}%`,
              top: `${50 - Math.cos(radians) * 27}%`,
            }}
          >
            <img
              alt=""
              className="dish-plate__img"
              decoding="async"
              loading="lazy"
              onLoad={fitDishPlate}
              src={dishImage(dish.sourceKey, dish.image).src}
              srcSet={dishImage(dish.sourceKey, dish.image, size === 'lg' ? '96px' : '64px').srcSet}
              sizes={size === 'lg' ? '96px' : '64px'}
            />
          </span>
        );
      })}
    </span>
  );
}

interface SavedMealDialogProps {
  meal: SavedRandomMeal;
  slots: MealSlot[];
  title: string;
  reuseDisabled: boolean;
  onReuse: () => void;
  onClose: () => void;
}

/** Hộp thoại chi tiết mâm đã lưu: món theo vai trò, chỉ số ước tính và thao tác dùng lại. */
export function SavedMealDialog({
  meal,
  slots,
  title,
  reuseDisabled,
  onReuse,
  onClose,
}: SavedMealDialogProps) {
  const { language, t } = useI18n();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stats = calculateMealStats(slots);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      // Không cuộn trang khi trả focus để thao tác "dùng lại mâm" cuộn lên đầu trang mượt mà.
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const perPerson = stats.hasNutrition ? t('ước tính / người') : t('chưa có dữ liệu');
  const metrics = [
    {
      label: t('Năng lượng'),
      value: stats.hasNutrition && stats.calories ? `${stats.calories} kcal` : '—',
      note: perPerson,
    },
    {
      label: t('Chất đạm'),
      value: stats.hasNutrition && stats.protein ? `${stats.protein} g` : '—',
      note: perPerson,
    },
    {
      label: t('Rau & quả'),
      value: stats.hasNutrition && stats.vegetableGrams ? `${stats.vegetableGrams} g` : '—',
      note: perPerson,
    },
    {
      label: t('Thời gian'),
      value: stats.maxMinutes ? formatDuration(stats.maxMinutes, language) : '—',
      note: t('món lâu nhất'),
    },
  ];

  return (
    <div
      className="modal-backdrop saved-meal-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="modal saved-meal-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="saved-meal-dialog__head">
          <SavedMealTray size="lg" slots={slots} />
          <div>
            <span className="section-label">{t('Mâm cơm đã lưu')}</span>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>
              {t('{count} món', { count: slots.length })}
              {formatSavedMealTime(meal.createdAt) && (
                <>
                  {' · '}
                  <time dateTime={meal.createdAt}>{formatSavedMealTime(meal.createdAt)}</time>
                </>
              )}
            </p>
          </div>
          <button
            aria-label={t('Đóng')}
            className="icon-button saved-meal-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <AppIcon name="close" size={18} />
          </button>
        </header>

        <div className="saved-meal-dialog__body">
          <ul className="saved-meal-dialog__dishes" aria-label={t('Danh sách món trong mâm')}>
            {slots.map((slot, index) => {
              const dish = slot.dish!;
              const servings = getRecipe(dish.sourceKey)?.servings;
              return (
                <li key={dish.id}>
                  <span
                    className="saved-meal-dialog__thumb dish-plate dish-plate--uniform"
                    data-dish-kind={guessDishPlateKind(dish.sourceKey, dish.image)}
                  >
                    <img
                      alt={dish.imageAlt}
                      className="dish-plate__img"
                      decoding="async"
                      loading="lazy"
                      onLoad={fitDishPlate}
                      src={dishImage(dish.sourceKey, dish.image).src}
                      srcSet={dishImage(dish.sourceKey, dish.image, '64px').srcSet}
                      sizes="64px"
                    />
                  </span>
                  <span className="saved-meal-dialog__dish-text">
                    <small>
                      {index + 1}. {t(roleDetails[slot.role].label)}
                    </small>
                    <strong>{t(dishName(dish))}</strong>
                    <span className="saved-meal-dialog__dish-meta">
                      {dish.calories !== null && <span>{dish.calories} kcal</span>}
                      {dish.protein !== null && (
                        <span>{t('{value} g đạm', { value: dish.protein })}</span>
                      )}
                      <span>{formatDuration(dish.minutes, language)}</span>
                      {servings ? <span>{t('{count} người', { count: servings })}</span> : null}
                    </span>
                  </span>
                  {dish.href && (
                    <Link
                      aria-label={t('Xem công thức {name}', { name: t(dishName(dish)) })}
                      className="saved-meal-dialog__recipe"
                      to={dish.href}
                    >
                      {t('Công thức')} <AppIcon name="arrow" size={14} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          <h3 className="saved-meal-dialog__subhead">{t('Chỉ số dinh dưỡng của mâm')}</h3>
          <dl className="saved-meal-dialog__metrics">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>
                  <strong>{metric.value}</strong>
                  <small>{metric.note}</small>
                </dd>
              </div>
            ))}
          </dl>
          <p className="nutrition-disclaimer">
            {t(
              'Chỉ số mang tính tham khảo theo một khẩu phần người lớn, không thay thế tư vấn dinh dưỡng chuyên môn.',
            )}
          </p>
        </div>

        <footer className="saved-meal-dialog__actions">
          <button className="button button--outline" onClick={onClose} type="button">
            {t('Đóng')}
          </button>
          <button
            className="button button--primary"
            disabled={reuseDisabled}
            onClick={onReuse}
            type="button"
          >
            <AppIcon name="refresh" size={17} /> {t('Dùng lại mâm này')}
          </button>
        </footer>
      </div>
    </div>
  );
}

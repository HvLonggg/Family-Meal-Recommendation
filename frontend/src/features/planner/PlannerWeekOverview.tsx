import { AppIcon } from '@/components/common/AppIcon';
import { dishImage } from '@/data/dishImages';
import type { PlanItem, PlannerMealType } from '@/data/plannerApi';
import { recipeText } from '@/data/recipes';
import type { CalendarMode } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  fastingDayName,
  formatDayMonth,
  formatWeekdayDate,
  type VegetarianState,
} from '@/features/planner/plannerCalendar';
import { lunarFromIsoDate, numericLunarLabel } from '@/lib/lunarCalendar';

/** Số món hiện trong một ô; bữa nhiều hơn thì hiện (giới hạn - 1) món và chip "+K món". */
const OVERVIEW_VISIBLE_DISHES = 3;

const shortMealLabels: Record<PlannerMealType, string> = {
  breakfast: 'Sáng',
  lunch: 'Trưa',
  dinner: 'Tối',
};

function visibleOverviewDishes<T>(items: T[]) {
  if (items.length <= OVERVIEW_VISIBLE_DISHES) return { shown: items, hidden: 0 };
  const shown = items.slice(0, OVERVIEW_VISIBLE_DISHES - 1);
  return { shown, hidden: items.length - shown.length };
}

function dateFromIso(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface PlannerWeekOverviewProps {
  days: string[];
  today: string;
  mode: CalendarMode;
  mealTypes: { id: PlannerMealType; label: string }[];
  groupedItems: Map<string, PlanItem[]>;
  vegetarianStateOf: (value: string) => VegetarianState;
  onOpenMeal: (date: string, mealType: PlannerMealType, trigger: HTMLElement) => void;
  onAddMeal: () => void;
  onEdit: () => void;
}

/** Bảng xem nhanh cả tuần, chỉ đọc: không có nút thêm/xóa, bấm ô để xem chi tiết bữa. */
export function PlannerWeekOverview({
  days,
  today,
  mode,
  mealTypes,
  groupedItems,
  vegetarianStateOf,
  onOpenMeal,
  onAddMeal,
  onEdit,
}: PlannerWeekOverviewProps) {
  const { locale, t } = useI18n();
  const slotsOf = (day: string) =>
    mealTypes.map((meal) => groupedItems.get(`${day}:${meal.id}`) ?? []);
  const totalDishes = days.reduce(
    (total, day) => total + slotsOf(day).reduce((sum, items) => sum + items.length, 0),
    0,
  );
  const plannedMeals = days.reduce(
    (total, day) => total + slotsOf(day).filter((items) => items.length).length,
    0,
  );
  const plannedDays = days.filter((day) => slotsOf(day).some((items) => items.length)).length;
  const vegetarianDays = days.filter((day) => vegetarianStateOf(day).vegetarian).length;

  if (!totalDishes) {
    return (
      <section
        aria-label={t('Tổng quan tuần')}
        className="planner-overview planner-overview--empty"
      >
        <div className="planner-overview__empty-state">
          <span aria-hidden="true" className="planner-overview__empty-icon">
            <AppIcon name="eye" size={26} />
          </span>
          <strong>{t('Tuần này chưa có bữa nào được lên kế hoạch')}</strong>
          <p>{t('Thêm vài món cho tuần mới, rồi quay lại đây để xem tổng quan cả tuần.')}</p>
          <div className="planner-overview__empty-actions">
            <button className="button button--primary" onClick={onAddMeal} type="button">
              <AppIcon name="plus" size={17} /> {t('Thêm bữa ăn')}
            </button>
            <button className="button button--outline" onClick={onEdit} type="button">
              <AppIcon name="calendar" size={17} /> {t('Về lịch chỉnh sửa')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t('Tổng quan tuần')} className="planner-overview">
      <dl className="planner-overview__stats">
        <div>
          <dt>{t('Tổng số món')}</dt>
          <dd>{totalDishes}</dd>
        </div>
        <div>
          <dt>{t('Bữa đã lên')}</dt>
          <dd>
            {plannedMeals}
            <small>/{days.length * mealTypes.length}</small>
          </dd>
        </div>
        <div>
          <dt>{t('Ngày có thực đơn')}</dt>
          <dd>
            {plannedDays}
            <small>/{days.length}</small>
          </dd>
        </div>
        {vegetarianDays ? (
          <div className="planner-overview__stat--veg">
            <dt>{t('Ngày ăn chay')}</dt>
            <dd>{vegetarianDays}</dd>
          </div>
        ) : null}
      </dl>
      <div className="planner-overview__grid">
        <div aria-hidden="true" className="planner-overview__labels">
          <span />
          {mealTypes.map((meal) => (
            <span key={meal.id}>{t(meal.label)}</span>
          ))}
        </div>
        {days.map((day) => {
          const solar = dateFromIso(day);
          const lunar = lunarFromIsoDate(day);
          const fasting = fastingDayName(lunar, t);
          const vegetarian = vegetarianStateOf(day).vegetarian;
          const isToday = day === today;
          const dayLabel = formatWeekdayDate(solar, locale);
          const dayCount = slotsOf(day).reduce((sum, items) => sum + items.length, 0);
          return (
            <article
              aria-label={
                vegetarian
                  ? t('{date} · ngày ăn chay', { date: formatWeekdayDate(solar, locale, true) })
                  : formatWeekdayDate(solar, locale, true)
              }
              className={`planner-overview__day${isToday ? ' is-today' : ''}${vegetarian ? ' is-vegetarian' : ''}`}
              data-day={day}
              key={day}
            >
              <header className="planner-overview__day-header">
                <span className="planner-overview__weekday">
                  {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(solar)}
                </span>
                <strong className="planner-overview__date">
                  {mode === 'lunar' ? numericLunarLabel(lunar) : formatDayMonth(solar, locale)}
                </strong>
                <small className="planner-overview__alt-date">
                  {mode === 'lunar'
                    ? t('DL {date}', { date: formatDayMonth(solar, locale) })
                    : t('ÂL {date}', { date: numericLunarLabel(lunar) })}
                  {fasting ? <em> · {fasting}</em> : null}
                </small>
                <span className="planner-overview__badges">
                  {isToday ? <span className="planner-overview__today">{t('Hôm nay')}</span> : null}
                  {vegetarian ? (
                    <span className="planner-overview__veg" title={t('Ngày ăn chay')}>
                      <AppIcon name="leaf" size={11} />
                      <span>{t('Chay')}</span>
                    </span>
                  ) : null}
                </span>
                <span className="planner-overview__day-count">
                  {dayCount ? t('{count} món', { count: dayCount }) : t('Trống')}
                </span>
              </header>
              {mealTypes.map((meal) => {
                const items = groupedItems.get(`${day}:${meal.id}`) ?? [];
                const mealLabel = t(meal.label);
                if (!items.length) {
                  return (
                    <div className="planner-overview__cell is-empty" key={meal.id}>
                      <span aria-hidden="true" className="planner-overview__meal-label">
                        {t(shortMealLabels[meal.id])}
                      </span>
                      <span
                        aria-label={t('{meal} chưa có món', { meal: mealLabel })}
                        className="planner-overview__dash"
                      >
                        —
                      </span>
                    </div>
                  );
                }
                const names = items.map((item) => recipeText(item.recipe.name));
                const { shown, hidden } = visibleOverviewDishes(items);
                return (
                  <button
                    aria-haspopup="dialog"
                    aria-label={t('Xem {meal} {date} · {count} món: {names}', {
                      meal: mealLabel.toLocaleLowerCase(locale),
                      date: dayLabel,
                      count: items.length,
                      names: names.join(', '),
                    })}
                    className="planner-overview__cell"
                    data-slot={`${day}:${meal.id}`}
                    key={meal.id}
                    onClick={(event) => onOpenMeal(day, meal.id, event.currentTarget)}
                    title={names.join('\n')}
                    type="button"
                  >
                    <span aria-hidden="true" className="planner-overview__meal-label">
                      {t(shortMealLabels[meal.id])}
                    </span>
                    <span className="planner-overview__dishes">
                      {shown.map((item) => (
                        <span
                          className={`planner-overview__dish${item.completion_status === 'completed' ? ' is-cooked' : ''}`}
                          key={item.id}
                        >
                          <img
                            alt=""
                            {...dishImage(item.recipe.slug, item.recipe.image_path, '24px')}
                          />
                          <span className="planner-overview__dish-name">
                            {recipeText(item.recipe.name)}
                          </span>
                        </span>
                      ))}
                    </span>
                    {hidden ? (
                      <span className="planner-overview__more">
                        {t('+{count} món', { count: hidden })}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}

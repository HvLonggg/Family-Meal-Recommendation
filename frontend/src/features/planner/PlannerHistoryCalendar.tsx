import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { dishImage } from '@/data/dishImages';
import {
  getPlanDays,
  getPlanItems,
  plannerDaysQueryKey,
  plannerItemsQueryKey,
  type MealCompletionStatus,
  type PlanItem,
  type PlannerMealType,
} from '@/data/plannerApi';
import { recipeText } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';
import { formatWeekdayDate } from '@/features/planner/plannerCalendar';
import { lunarFromIsoDate, numericLunarLabel } from '@/lib/lunarCalendar';

import './planner-history-calendar.css';

const MEALS: { id: PlannerMealType; label: string }[] = [
  { id: 'breakfast', label: 'Bữa sáng' },
  { id: 'lunch', label: 'Bữa trưa' },
  { id: 'dinner', label: 'Bữa tối' },
];
const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function isoOf(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Thứ Hai … 6 = Chủ Nhật. */
function isoWeekday(year: number, month: number, day: number) {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function localDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function mealStatusOf(items: PlanItem[]): MealCompletionStatus {
  const statuses = new Set(items.map((item) => item.completion_status));
  if (statuses.size === 1 && statuses.has('completed')) return 'completed';
  if (statuses.size === 1 && statuses.has('skipped')) return 'skipped';
  return 'planned';
}

interface PlannerHistoryCalendarProps {
  userId: string;
  today: string;
  sundayFirst?: boolean;
  onOpenWeek?: (date: string) => void;
}

/** Lịch tháng của tab lịch sử: chấm các ngày có bữa, bấm một ngày để xem các bữa của ngày đó. */
export function PlannerHistoryCalendar({
  userId,
  today,
  sundayFirst = false,
  onOpenWeek,
}: PlannerHistoryCalendarProps) {
  const { locale, t } = useI18n();
  const [todayYear, todayMonth] = today.split('-').map(Number) as [number, number];
  const [cursor, setCursor] = useState({ year: todayYear, month: todayMonth });
  const [selected, setSelected] = useState(today);

  const monthFrom = isoOf(cursor.year, cursor.month, 1);
  const monthTo = isoOf(cursor.year, cursor.month, daysInMonth(cursor.year, cursor.month));
  const daysQuery = useQuery({
    queryKey: plannerDaysQueryKey(userId, monthFrom, monthTo),
    queryFn: ({ signal }) => getPlanDays(monthFrom, monthTo, signal),
  });
  const dayQuery = useQuery({
    queryKey: plannerItemsQueryKey(userId, selected, selected),
    queryFn: ({ signal }) => getPlanItems(selected, selected, signal),
  });

  const summaries = useMemo(
    () => new Map((daysQuery.data ?? []).map((day) => [day.plan_date, day])),
    [daysQuery.data],
  );
  const leading = (isoWeekday(cursor.year, cursor.month, 1) + (sundayFirst ? 1 : 0)) % 7;
  const total = daysInMonth(cursor.year, cursor.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, index) => index + 1),
  ];
  const weekdayLabels = sundayFirst ? ['CN', ...WEEKDAY_SHORT.slice(0, 6)] : WEEKDAY_SHORT;
  const years = Array.from({ length: 5 }, (_, index) => todayYear - 3 + index);
  const monthName = (month: number) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2026, month - 1, 1));

  const shiftMonth = (delta: number) =>
    setCursor((current) => {
      const index = current.year * 12 + (current.month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  const goToday = () => {
    setCursor({ year: todayYear, month: todayMonth });
    setSelected(today);
  };

  const byMeal = new Map<PlannerMealType, PlanItem[]>();
  for (const item of dayQuery.data ?? []) {
    byMeal.set(item.meal_type, [...(byMeal.get(item.meal_type) ?? []), item]);
  }
  const selectedLabel = formatWeekdayDate(localDate(selected), locale, true);

  return (
    <section aria-label={t('Xem lịch sử theo ngày')} className="history-calendar">
      <div className="history-calendar__month">
        <div className="history-calendar__toolbar">
          <button
            aria-label={t('Tháng trước')}
            className="history-calendar__nav history-calendar__nav--prev"
            onClick={() => shiftMonth(-1)}
            type="button"
          >
            <AppIcon name="arrow" size={16} />
          </button>
          <select
            aria-label={t('Tháng hiển thị')}
            onChange={(event) =>
              setCursor((current) => ({ ...current, month: Number(event.target.value) }))
            }
            value={cursor.month}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {monthName(index + 1)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('Chọn năm')}
            onChange={(event) =>
              setCursor((current) => ({ ...current, year: Number(event.target.value) }))
            }
            value={cursor.year}
          >
            {(years.includes(cursor.year) ? years : [...years, cursor.year].sort()).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            aria-label={t('Tháng sau')}
            className="history-calendar__nav"
            onClick={() => shiftMonth(1)}
            type="button"
          >
            <AppIcon name="arrow" size={16} />
          </button>
          <button className="history-calendar__today" onClick={goToday} type="button">
            {t('Hôm nay')}
          </button>
        </div>
        <div className="history-calendar__grid" role="group" aria-label={t('Các ngày trong tháng')}>
          {weekdayLabels.map((label) => (
            <span aria-hidden="true" className="history-calendar__weekday" key={label}>
              {t(label)}
            </span>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <span aria-hidden="true" key={`blank-${index}`} />;
            const value = isoOf(cursor.year, cursor.month, day);
            const summary = summaries.get(value);
            const isSelected = value === selected;
            const label = summary
              ? t('{date}: {count} bữa, {done}/{items} món đã nấu', {
                  date: formatWeekdayDate(localDate(value), locale, true),
                  count: summary.meal_types.length,
                  done: summary.completed_count,
                  items: summary.item_count,
                })
              : formatWeekdayDate(localDate(value), locale, true);
            return (
              <button
                aria-label={label}
                aria-pressed={isSelected}
                className={`history-calendar__day${isSelected ? ' is-selected' : ''}${
                  value === today ? ' is-today' : ''
                }${summary ? ' has-meals' : ''}${value > today ? ' is-future' : ''}`}
                key={value}
                onClick={() => setSelected(value)}
                type="button"
              >
                <span>{day}</span>
                {summary ? (
                  <span aria-hidden="true" className="history-calendar__dots">
                    {summary.meal_types.map((meal) => (
                      <i
                        className={`is-${meal}${
                          summary.completed_count === summary.item_count ? ' is-done' : ''
                        }`}
                        key={meal}
                      />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {daysQuery.isError ? (
          <p className="history-calendar__error" role="alert">
            {t('Chưa tải được các ngày có bữa ăn.')}
          </p>
        ) : null}
        <p className="history-calendar__legend">
          <i className="is-breakfast" /> {t('Sáng')} <i className="is-lunch" /> {t('Trưa')}{' '}
          <i className="is-dinner" /> {t('Tối')}
        </p>
      </div>

      <article aria-live="polite" className="history-calendar__detail">
        <header>
          <div>
            <h3>{selectedLabel}</h3>
            <small>{t('ÂL {date}', { date: numericLunarLabel(lunarFromIsoDate(selected)) })}</small>
          </div>
          {onOpenWeek ? (
            <button
              className="history-calendar__open-week"
              onClick={() => onOpenWeek(selected)}
              type="button"
            >
              <AppIcon name="calendar" size={15} /> {t('Mở tuần này')}
            </button>
          ) : null}
        </header>
        {dayQuery.isLoading ? (
          <p className="history-calendar__muted" role="status">
            {t('Đang tải các bữa của ngày…')}
          </p>
        ) : dayQuery.isError ? (
          <p className="history-calendar__error" role="alert">
            {t('Chưa tải được các bữa của ngày này.')}
          </p>
        ) : byMeal.size ? (
          <ol className="history-calendar__meals">
            {MEALS.filter((meal) => byMeal.has(meal.id)).map((meal) => {
              const items = byMeal.get(meal.id)!;
              const status = mealStatusOf(items);
              return (
                <li key={meal.id}>
                  <div className="history-calendar__meal-head">
                    <strong>{t(meal.label)}</strong>
                    <span className={`planner-status-pill is-${status}`}>
                      {status === 'completed'
                        ? t('Đã nấu')
                        : status === 'skipped'
                          ? t('Đã bỏ qua')
                          : t('Theo kế hoạch')}
                    </span>
                  </div>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link to={`/recipes/${item.recipe.slug}`}>
                          <img alt="" {...dishImage(item.recipe.slug, item.recipe.image_path)} />
                          <span>{recipeText(item.recipe.name)}</span>
                        </Link>
                        <small>
                          {item.completion_status === 'completed' ? (
                            <AppIcon name="check" size={12} />
                          ) : null}
                          {t('{count} khẩu phần', { count: item.servings })}
                        </small>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="history-calendar__muted">{t('Ngày này chưa có bữa nào.')}</p>
        )}
      </article>
    </section>
  );
}

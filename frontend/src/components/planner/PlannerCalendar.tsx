import { AppIcon } from '@/components/common/AppIcon';
import type { CalendarMode } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  fastingDayName,
  formatDayMonth,
  formatLunarLong,
  lunarMonthLabel,
  nextLunarFastingDay,
  type VegetarianState,
} from '@/features/planner/plannerCalendar';
import {
  lunarDayCanChi,
  lunarFromIsoDate,
  lunarMonthCanChi,
  lunarYearName,
  numericLunarLabel,
} from '@/lib/lunarCalendar';

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

interface CalendarModeSwitchProps {
  mode: CalendarMode;
  disabled?: boolean;
  onChange: (mode: CalendarMode) => void;
}

export function CalendarModeSwitch({ mode, disabled, onChange }: CalendarModeSwitchProps) {
  const { t } = useI18n();
  return (
    <div aria-label={t('Lịch hiển thị chính')} className="planner-calendar-switch" role="group">
      {(['solar', 'lunar'] as const).map((option) => (
        <button
          aria-pressed={mode === option}
          className={mode === option ? 'is-active' : ''}
          disabled={disabled}
          key={option}
          onClick={() => {
            if (option !== mode) onChange(option);
          }}
          type="button"
        >
          <AppIcon name={option === 'solar' ? 'calendar' : 'moon'} size={15} />
          {option === 'solar' ? t('Dương lịch') : t('Âm lịch')}
        </button>
      ))}
    </div>
  );
}

interface PlannerCalendarHeaderProps {
  today: string;
  mode: CalendarMode;
  modeSaving: boolean;
  onModeChange: (mode: CalendarMode) => void;
  todayVegetarian: VegetarianState;
  vegetarianPending: boolean;
  onToggleTodayVegetarian: () => void;
}

/** Hiển thị dương lịch và âm lịch hôm nay theo giờ Việt Nam. */
export function PlannerCalendarHeader({
  today,
  mode,
  modeSaving,
  onModeChange,
  todayVegetarian,
  vegetarianPending,
  onToggleTodayVegetarian,
}: PlannerCalendarHeaderProps) {
  const { locale, t } = useI18n();
  const solar = dateFromIso(today);
  const lunar = lunarFromIsoDate(today);
  const todayFasting = fastingDayName(lunar, t);
  const next = nextLunarFastingDay(today);
  const nextName = next ? fastingDayName(next.lunar, t) : null;
  const nextDate = next
    ? `${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(dateFromIso(next.value))} ${formatDayMonth(dateFromIso(next.value), locale)}`
    : '';

  return (
    <section
      aria-label={t('Lịch hôm nay')}
      className={`planner-calendar-hero${todayVegetarian.vegetarian ? ' is-vegetarian' : ''}`}
    >
      <div className="planner-calendar-hero__dates">
        <article className={`planner-date-card${mode === 'solar' ? ' is-primary' : ''}`}>
          <span className="planner-date-card__kicker">
            <AppIcon name="calendar" size={14} /> {t('Dương lịch')}
          </span>
          <div className="planner-date-card__body">
            <strong className="planner-date-card__day">{solar.getDate()}</strong>
            <div>
              <span className="planner-date-card__title">
                {new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(solar)}
              </span>
              <small>
                {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(solar)}
              </small>
            </div>
          </div>
        </article>
        <article
          className={`planner-date-card planner-date-card--lunar${mode === 'lunar' ? ' is-primary' : ''}`}
        >
          <span className="planner-date-card__kicker">
            <AppIcon name="moon" size={14} /> {t('Âm lịch')}
            {todayFasting ? <em>{todayFasting}</em> : null}
          </span>
          <div className="planner-date-card__body">
            <strong className="planner-date-card__day">{lunar.day}</strong>
            <div>
              <span className="planner-date-card__title">
                {t('Tháng {month} · năm {year}', {
                  month: lunarMonthLabel(lunar, t),
                  year: lunarYearName(lunar.year),
                })}
              </span>
              <small>
                {t('Ngày {day} · tháng {month}', {
                  day: lunarDayCanChi(lunar),
                  month: lunarMonthCanChi(lunar),
                })}
              </small>
            </div>
          </div>
        </article>
      </div>

      <div className="planner-calendar-hero__side">
        <CalendarModeSwitch disabled={modeSaving} mode={mode} onChange={onModeChange} />
        <button
          aria-pressed={todayVegetarian.vegetarian}
          className={`planner-veg-today${todayVegetarian.vegetarian ? ' is-active' : ''}`}
          disabled={vegetarianPending}
          onClick={onToggleTodayVegetarian}
          type="button"
        >
          <AppIcon name="leaf" size={16} />
          {todayVegetarian.vegetarian ? t('Hôm nay ăn chay') : t('Đánh dấu hôm nay ăn chay')}
        </button>
        {next && nextName ? (
          <p className="planner-calendar-hero__next">
            <AppIcon name="moon" size={14} />
            {next.daysAway === 1
              ? t('{name} vào ngày mai ({date})', { name: nextName, date: nextDate })
              : t('{name} sắp tới: {date} · còn {count} ngày', {
                  name: nextName,
                  date: nextDate,
                  count: next.daysAway,
                })}
          </p>
        ) : null}
        <small className="planner-calendar-hero__zone">
          {t('Theo giờ Việt Nam (GMT+7) · {date}', { date: formatLunarLong(lunar, t) })}
        </small>
      </div>
    </section>
  );
}

interface PlannerDayHeaderProps {
  value: string;
  isToday: boolean;
  mode: CalendarMode;
  vegetarian: VegetarianState;
  pending: boolean;
  onToggleVegetarian: () => void;
}

export function PlannerDayHeader({
  value,
  isToday,
  mode,
  vegetarian,
  pending,
  onToggleVegetarian,
}: PlannerDayHeaderProps) {
  const { locale, t } = useI18n();
  const solar = dateFromIso(value);
  const lunar = lunarFromIsoDate(value);
  const fasting = fastingDayName(lunar, t);
  const solarShort = formatDayMonth(solar, locale);
  const lunarShort = numericLunarLabel(lunar);
  const fullLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(solar);

  return (
    <header className="planner-day__header">
      <div className="planner-day__weekday">
        <span>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(solar)}</span>
        {fasting ? <em className="planner-day__moon">{fasting}</em> : null}
      </div>
      <div
        className="planner-day__dates"
        title={`${fullLabel} · ${formatLunarLong(lunar, t)}${isToday ? ` · ${t('Hôm nay')}` : ''}`}
      >
        <strong>{mode === 'lunar' ? lunar.day : solar.getDate()}</strong>
        <small>
          {mode === 'lunar'
            ? t('DL {date}', { date: solarShort })
            : t('ÂL {date}', { date: lunarShort })}
        </small>
      </div>
      <button
        aria-label={
          vegetarian.vegetarian
            ? t('Bỏ đánh dấu ăn chay ngày {date}', { date: value })
            : t('Đánh dấu ăn chay ngày {date}', { date: value })
        }
        aria-pressed={vegetarian.vegetarian}
        className={`planner-veg-toggle${vegetarian.vegetarian ? ' is-active' : ''}`}
        disabled={pending}
        onClick={onToggleVegetarian}
        title={
          vegetarian.source === 'lunar'
            ? t('Tự đánh dấu vì là mùng 1 hoặc rằm. Bấm để bỏ.')
            : vegetarian.vegetarian
              ? t('Bỏ đánh dấu ngày ăn chay')
              : t('Đánh dấu ngày ăn chay')
        }
        type="button"
      >
        <AppIcon name="leaf" size={14} />
      </button>
      {vegetarian.vegetarian ? (
        // Hiển thị huy hiệu mà không làm lệch nội dung ngày.
        <span className="planner-day__veg-banner">
          <AppIcon name="leaf" size={12} />
          {vegetarian.source === 'lunar' ? t('Ăn chay · tự động') : t('Ngày ăn chay')}
        </span>
      ) : null}
    </header>
  );
}

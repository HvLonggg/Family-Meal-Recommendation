import { useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { Panel, Toggle } from '@/components/ui/Workspace';
import type { UserPreferences } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';
import type { Translate } from '@/features/i18n/translate';
import {
  formatWeekdayDate,
  nextVegetarianDays,
  vegetarianRulesFrom,
} from '@/features/planner/plannerCalendar';

import './settings-page.css';

/** Thứ theo ISO: 0 = Thứ Hai … 6 = Chủ Nhật (khớp backend). */
const WEEKDAYS = [
  { value: 0, short: 'T2', long: 'Thứ Hai' },
  { value: 1, short: 'T3', long: 'Thứ Ba' },
  { value: 2, short: 'T4', long: 'Thứ Tư' },
  { value: 3, short: 'T5', long: 'Thứ Năm' },
  { value: 4, short: 'T6', long: 'Thứ Sáu' },
  { value: 5, short: 'T7', long: 'Thứ Bảy' },
  { value: 6, short: 'CN', long: 'Chủ Nhật' },
];
const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

type VegetarianField =
  'vegetarian_lunar_days' | 'vegetarian_month_days' | 'vegetarian_weekdays' | 'vegetarian_months';

function toggleNumber(list: number[], value: number) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value].sort((left, right) => left - right);
}

function joinList(items: string[], t: Translate) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${t('và')} ${items.at(-1)}`;
}

/** Câu tóm tắt quy tắc đang chọn, ví dụ "Thứ Hai hằng tuần, ngày 1 và 15 hằng tháng — tháng 1, 7". */
function describeVegetarianRules(
  preferences: Pick<UserPreferences, VegetarianField>,
  t: Translate,
) {
  const rules = vegetarianRulesFrom(preferences);
  const parts: string[] = [];
  if (rules.weekdays.length) {
    const names = rules.weekdays.map((value) => t(WEEKDAYS[value]?.long ?? ''));
    parts.push(t('{days} hằng tuần', { days: joinList(names, t) }));
  }
  if (rules.monthDays.length) {
    parts.push(t('ngày {days} hằng tháng', { days: joinList(rules.monthDays.map(String), t) }));
  }
  let summary = parts.join(', ');
  if (summary && rules.months.length) {
    summary = `${summary} — ${t('tháng {months}', { months: rules.months.join(', ') })}`;
  }
  if (rules.lunarDays) {
    const lunar = t('ngày 1 và 15 theo lịch đang dùng');
    summary = summary ? `${summary}; ${lunar}` : lunar;
  }
  return summary;
}

interface VegetarianDaysPanelProps {
  draft: UserPreferences;
  today: string;
  update: <K extends VegetarianField>(key: K, value: UserPreferences[K]) => void;
}

export function VegetarianDaysPanel({ draft, today, update }: VegetarianDaysPanelProps) {
  const { locale, t } = useI18n();
  const weekdays = draft.vegetarian_weekdays ?? [];
  const monthDays = draft.vegetarian_month_days ?? [];
  const months = draft.vegetarian_months ?? [];
  const [monthMode, setMonthMode] = useState<'all' | 'pick'>(months.length ? 'pick' : 'all');
  const summary = describeVegetarianRules(draft, t);
  const upcoming = summary ? nextVegetarianDays(today, vegetarianRulesFrom(draft), 3) : [];
  const dateOf = (value: string) => {
    const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const chooseMonthMode = (mode: 'all' | 'pick') => {
    setMonthMode(mode);
    if (mode === 'all' && months.length) update('vegetarian_months', []);
  };

  return (
    <Panel
      className="veg-days"
      description={t(
        'Chọn những ngày cả nhà ăn chay. Lịch kế hoạch sẽ tô vàng các ngày này; bạn vẫn bật/tắt được từng ngày.',
      )}
      icon="leaf"
      id="vegetarian"
      title={t('Ngày ăn chay')}
    >
      <fieldset className="veg-days__group">
        <legend>{t('Hằng tuần')}</legend>
        <div className="veg-days__weekdays">
          {WEEKDAYS.map((day) => {
            const active = weekdays.includes(day.value);
            return (
              <button
                aria-label={t(day.long)}
                aria-pressed={active}
                className={`veg-chip${active ? ' is-active' : ''}`}
                key={day.value}
                onClick={() => update('vegetarian_weekdays', toggleNumber(weekdays, day.value))}
                type="button"
              >
                {t(day.short)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="veg-days__group">
        <legend>{t('Ngày cố định trong tháng (dương lịch)')}</legend>
        <div className="veg-days__month-grid">
          {MONTH_DAYS.map((day) => {
            const active = monthDays.includes(day);
            return (
              <button
                aria-label={t('Ngày {day}', { day })}
                aria-pressed={active}
                className={`veg-chip veg-chip--day${active ? ' is-active' : ''}`}
                key={day}
                onClick={() => update('vegetarian_month_days', toggleNumber(monthDays, day))}
                type="button"
              >
                {day}
              </button>
            );
          })}
        </div>
        <small className="veg-days__hint">
          {t('Tháng không có ngày 29–31 sẽ tự bỏ qua ngày đó.')}
        </small>
      </fieldset>

      <fieldset className="veg-days__group">
        <legend>{t('Áp dụng cho')}</legend>
        <div className="veg-days__radios">
          <label>
            <input
              checked={monthMode === 'all'}
              name="veg-month-mode"
              onChange={() => chooseMonthMode('all')}
              type="radio"
            />
            {t('Tất cả các tháng')}
          </label>
          <label>
            <input
              checked={monthMode === 'pick'}
              name="veg-month-mode"
              onChange={() => chooseMonthMode('pick')}
              type="radio"
            />
            {t('Chọn tháng')}
          </label>
        </div>
        {monthMode === 'pick' ? (
          <>
            <div className="veg-days__months">
              {MONTHS.map((month) => {
                const active = months.includes(month);
                return (
                  <button
                    aria-label={t('Tháng {month}', { month })}
                    aria-pressed={active}
                    className={`veg-chip${active ? ' is-active' : ''}`}
                    key={month}
                    onClick={() => update('vegetarian_months', toggleNumber(months, month))}
                    type="button"
                  >
                    {t('Th {month}', { month })}
                  </button>
                );
              })}
            </div>
            {!months.length ? (
              <small className="veg-days__hint">
                {t('Chưa chọn tháng nào nên lịch đang áp dụng cho mọi tháng.')}
              </small>
            ) : null}
          </>
        ) : null}
      </fieldset>

      <Toggle
        checked={draft.vegetarian_lunar_days}
        description={t(
          'Mặc định tắt. Tính theo lịch bạn đang dùng ở Kế hoạch: lịch dương đánh dấu ngày 1 và 15, lịch âm đánh dấu mùng 1 và rằm. Tắt thì không tự đánh dấu.',
        )}
        label={t('Tự đánh dấu ngày 1 và 15 (mùng 1, rằm)')}
        onChange={(value) => update('vegetarian_lunar_days', value)}
      />

      <div aria-live="polite" className={`veg-days__preview${summary ? ' is-set' : ''}`}>
        <AppIcon name="leaf" size={15} />
        <div>
          <strong>
            {summary ? t('Áp dụng: {summary}', { summary }) : t('Chưa có ngày ăn chay cố định.')}
          </strong>
          {upcoming.length ? (
            <small>
              {t('Sắp tới: {dates}', {
                dates: upcoming
                  .map((value) => formatWeekdayDate(dateOf(value), locale))
                  .join(' · '),
              })}
            </small>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

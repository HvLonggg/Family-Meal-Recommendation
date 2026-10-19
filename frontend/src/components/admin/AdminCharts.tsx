import { useMemo } from 'react';

import type { DailyCount } from '@/features/admin/adminApi';
import { useI18n } from '@/features/i18n/I18nContext';

interface ActivityBarsProps {
  data: DailyCount[];
  /** Tên chuỗi số liệu, dùng cho tooltip và mô tả trợ năng. */
  label: string;
  height?: number;
}

/** Biểu đồ hoạt động theo ngày. */
export function ActivityBars({ data, height = 132, label }: ActivityBarsProps) {
  const { formatDate, formatNumber, t } = useI18n();
  const max = Math.max(1, ...data.map((item) => item.count));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const peak = data.reduce<DailyCount | null>(
    (best, item) => (item.count > (best?.count ?? 0) ? item : best),
    null,
  );
  const ticks = useMemo(
    () => new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]),
    [data.length],
  );
  const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
    formatDate(`${day}T00:00:00`, options);

  return (
    <figure className="activity-bars">
      <figcaption className="activity-bars__summary">
        <strong>{formatNumber(total)}</strong>
        <span>
          {t('{label} trong {days} ngày', { label: t(label).toLowerCase(), days: data.length })}
        </span>
        {peak ? (
          <em>
            {t('Cao nhất {count} vào {day}', {
              count: peak.count,
              day: dayLabel(peak.day, { day: '2-digit', month: '2-digit' }),
            })}
          </em>
        ) : null}
      </figcaption>
      <div className="activity-bars__plot" role="list" style={{ height }}>
        {data.map((item, index) => {
          const text = `${dayLabel(item.day, { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${formatNumber(item.count)} ${t(label).toLowerCase()}`;
          return (
            <div
              aria-label={text}
              className={`activity-bars__col${item.count ? '' : ' is-empty'}`}
              key={item.day}
              role="listitem"
            >
              <span
                className="activity-bars__bar"
                style={{ height: `${Math.max(item.count ? 6 : 2, (item.count / max) * 100)}%` }}
              />
              <span className="activity-bars__tip" role="presentation">
                <b>{formatNumber(item.count)}</b>
                {dayLabel(item.day, { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </span>
              {ticks.has(index) ? (
                <span aria-hidden="true" className="activity-bars__tick">
                  {dayLabel(item.day, { day: '2-digit', month: '2-digit' })}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

interface MeterListProps {
  items: { label: string; count: number }[];
  emptyText: string;
}

/** So sánh các giá trị bằng thanh ngang. */
export function MeterList({ emptyText, items }: MeterListProps) {
  const { formatNumber, t } = useI18n();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!items.length) return <p className="muted">{emptyText}</p>;
  const max = Math.max(...items.map((item) => item.count));
  return (
    <ul className="meter-list">
      {items.map((item) => (
        <li key={item.label} title={`${t(item.label)}: ${item.count}`}>
          <span className="meter-list__label">{t(item.label)}</span>
          <span className="meter-list__track" aria-hidden="true">
            <span style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="meter-list__value">
            {formatNumber(item.count)}
            <small>{Math.round((item.count / total) * 100)}%</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

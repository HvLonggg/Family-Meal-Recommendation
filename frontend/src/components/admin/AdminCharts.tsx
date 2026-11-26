import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { DailyCount } from '@/features/admin/adminApi';
import { monotonePath, niceTicks, percentChange } from '@/features/admin/chartMath';
import { useI18n } from '@/features/i18n/I18nContext';

/* Biểu đồ SVG viết tay cho trang quản trị: không thêm thư viện nặng, đọc được trên màn 360px. */

function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      if (node.clientWidth > 0) setWidth(node.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const sum = (data: DailyCount[]) => data.reduce((total, item) => total + item.count, 0);

/* ---------- KPI: giá trị, mức tăng/giảm và sparkline ---------- */

export function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const { formatNumber, t } = useI18n();
  const change = percentChange(current, previous);
  const direction = change === null || change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const text =
    change === null
      ? t('Mới')
      : `${direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'} ${Math.abs(change)}%`;
  return (
    <span
      className={`kpi-delta kpi-delta--${direction}`}
      title={t('Kỳ trước: {count}', { count: formatNumber(previous) })}
    >
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">
        {change === null
          ? t('Tăng từ 0 ở kỳ trước')
          : change === 0
            ? t('Không đổi so với kỳ trước')
            : t('{direction} {percent}% so với kỳ trước', {
                direction: direction === 'up' ? t('Tăng') : t('Giảm'),
                percent: Math.abs(change),
              })}
      </span>
    </span>
  );
}

export function Sparkline({
  data,
  width = 96,
  height = 28,
}: {
  data: DailyCount[];
  width?: number;
  height?: number;
}) {
  const gradient = useId();
  if (data.length < 2) return null;
  const max = Math.max(1, ...data.map((item) => item.count));
  const points = data.map((item, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - 2 - (item.count / max) * (height - 4),
  }));
  const line = monotonePath(points);
  return (
    <svg
      aria-hidden="true"
      className="sparkline"
      focusable="false"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${gradient})`} />
      <path d={line} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  previous: number;
  series: DailyCount[];
  active?: boolean;
  onSelect?: () => void;
}

/** Thẻ chỉ số: bấm để xem chỉ số đó trên biểu đồ xu hướng. */
export function KpiCard({
  active = false,
  label,
  onSelect,
  previous,
  series,
  value,
}: KpiCardProps) {
  const { formatNumber, t } = useI18n();
  return (
    <button
      aria-pressed={active}
      className={`kpi-card${active ? ' is-active' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className="kpi-card__label">{t(label)}</span>
      <strong className="kpi-card__value">{formatNumber(value)}</strong>
      <span className="kpi-card__foot">
        <DeltaBadge current={value} previous={previous} />
        <Sparkline data={series} />
      </span>
    </button>
  );
}

/* ---------- Biểu đồ xu hướng theo ngày ---------- */

interface TrendChartProps {
  data: DailyCount[];
  /** Tên chỉ số (khóa tiếng Việt cho t()), dùng cho tooltip và mô tả trợ năng. */
  label: string;
  height?: number;
}

const PAD = { top: 16, right: 14, bottom: 28, left: 36 };

export function TrendChart({ data, height = 240, label }: TrendChartProps) {
  const { formatDate, formatNumber, t } = useI18n();
  const gradient = useId();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const metric = t(label);

  const day = (value: string, options: Intl.DateTimeFormatOptions) =>
    formatDate(`${value}T00:00:00`, options);
  const total = sum(data);
  const peak = data.reduce<DailyCount | null>(
    (best, item) => (item.count > (best?.count ?? 0) ? item : best),
    null,
  );
  const firstDay = data[0];
  const lastDay = data[data.length - 1];
  const summary =
    firstDay && lastDay
      ? t('{metric}: tổng {total} trong {days} ngày, từ {from} đến {to}.', {
          metric,
          total: formatNumber(total),
          days: data.length,
          from: day(firstDay.day, { day: '2-digit', month: '2-digit' }),
          to: day(lastDay.day, { day: '2-digit', month: '2-digit' }),
        }) +
        (peak
          ? ` ${t('Cao nhất {count} vào {day}', { count: formatNumber(peak.count), day: day(peak.day, { day: '2-digit', month: '2-digit' }) })}.`
          : '')
      : t('Chưa có dữ liệu.');

  const innerW = Math.max(40, width - PAD.left - PAD.right);
  const innerH = Math.max(40, height - PAD.top - PAD.bottom);
  const ticks = niceTicks(Math.max(0, ...data.map((item) => item.count)));
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) =>
    PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH;
  const points = data.map((item, i) => ({ x: x(i), y: y(item.count) }));
  const line = monotonePath(points);
  const baseline = PAD.top + innerH;
  // Nhãn trục hoành: tối đa ~1 nhãn mỗi 72px để không chồng chữ trên màn hẹp.
  const labelCount = Math.max(2, Math.min(data.length, Math.floor(innerW / 72)));
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, k) =>
      Math.round((k / (labelCount - 1)) * (data.length - 1)),
    ),
  );

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    if (!data.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - PAD.left) / innerW;
    setActive(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!data.length) return;
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(data.length - 1);
    else if (step)
      setActive((current) =>
        Math.min(data.length - 1, Math.max(0, (current ?? data.length - 1) + step)),
      );
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };

  const current = active === null ? null : data[active];
  const tipLeft = active === null ? 0 : Math.min(Math.max(x(active), 70), width - 70);

  return (
    <figure className="trend-chart">
      <div className="trend-chart__plot" ref={wrapRef}>
        {total === 0 ? (
          <p className="trend-chart__empty">{t('Chưa có hoạt động nào trong kỳ này.')}</p>
        ) : null}
        <svg
          aria-label={summary}
          className="trend-chart__svg"
          height={height}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          onPointerLeave={() => setActive(null)}
          onPointerMove={pick}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g aria-hidden="true" className="trend-chart__grid">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={y(tick)} y2={y(tick)} />
                <text dy="0.32em" textAnchor="end" x={PAD.left - 8} y={y(tick)}>
                  {formatNumber(tick)}
                </text>
              </g>
            ))}
            {data.map((item, i) =>
              labelIndexes.has(i) ? (
                <text
                  key={item.day}
                  textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                  x={x(i)}
                  y={height - 8}
                >
                  {day(item.day, { day: '2-digit', month: '2-digit' })}
                </text>
              ) : null,
            )}
          </g>
          {points.length > 1 ? (
            <g aria-hidden="true" className="trend-chart__series">
              <path
                d={`${line}L${x(data.length - 1)},${baseline}L${x(0)},${baseline}Z`}
                fill={`url(#${gradient})`}
              />
              <path className="trend-chart__line" d={line} fill="none" />
            </g>
          ) : null}
          {current && active !== null ? (
            <g aria-hidden="true" className="trend-chart__focus">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={baseline} />
              <circle cx={x(active)} cy={y(current.count)} r="4.5" />
            </g>
          ) : null}
        </svg>
        {current ? (
          <div aria-live="polite" className="trend-chart__tip" style={{ left: tipLeft }}>
            <strong>{formatNumber(current.count)}</strong>
            <span>{metric.toLowerCase()}</span>
            <small>
              {day(current.day, {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </small>
          </div>
        ) : null}
      </div>
      <figcaption className="trend-chart__caption">
        <span>
          <strong>{formatNumber(total)}</strong> {metric.toLowerCase()} ·{' '}
          {t('{days} ngày', { days: data.length })}
        </span>
        {peak ? (
          <em>
            {t('Cao nhất {count} vào {day}', {
              count: formatNumber(peak.count),
              day: day(peak.day, { day: '2-digit', month: '2-digit' }),
            })}
          </em>
        ) : null}
      </figcaption>
      <details className="chart-table">
        <summary>{t('Xem bảng số liệu')}</summary>
        <div className="chart-table__scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('Ngày')}</th>
                <th scope="col">{metric}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.day}>
                  <th scope="row">
                    {day(item.day, { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </th>
                  <td>{formatNumber(item.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Tương thích ngược: biểu đồ hoạt động theo ngày (nay vẽ bằng đường xu hướng). */
export function ActivityBars({ data, height = 200, label }: TrendChartProps) {
  return <TrendChart data={data} height={height} label={label} />;
}

/* ---------- Phân bố: thanh ngang có nhãn và phần trăm ---------- */

interface DistributionBarsProps {
  items: { label: string; count: number }[];
  emptyText: string;
  /** Tiêu đề ngắn cho mô tả trợ năng. */
  label?: string;
}

export function DistributionBars({ emptyText, items, label }: DistributionBarsProps) {
  const { formatNumber, t } = useI18n();
  if (!items.length) return <p className="muted chart-empty">{emptyText}</p>;
  const total = items.reduce((acc, item) => acc + item.count, 0) || 1;
  const max = Math.max(...items.map((item) => item.count)) || 1;
  const summary = items
    .map(
      (item) =>
        `${t(item.label)} ${formatNumber(item.count)} (${Math.round((item.count / total) * 100)}%)`,
    )
    .join(', ');
  return (
    <ul aria-label={label ? `${t(label)}: ${summary}` : summary} className="meter-list">
      {items.map((item) => {
        const percent = Math.round((item.count / total) * 100);
        return (
          <li key={item.label}>
            <span className="meter-list__label">{t(item.label)}</span>
            <span className="meter-list__value">
              {formatNumber(item.count)}
              <small>{percent}%</small>
            </span>
            <span aria-hidden="true" className="meter-list__track">
              <span style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Tương thích ngược với tên cũ. */
export function MeterList(props: DistributionBarsProps) {
  return <DistributionBars {...props} />;
}

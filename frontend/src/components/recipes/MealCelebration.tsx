import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';

export const MEAL_CELEBRATION_MS = 1800;
const colors = ['#f8cc6a', '#ea8b6e', '#91bb9e', '#f5ead3', '#dba0a9'];
const bursts = [
  { x: '24%', y: '42%', delay: 0 },
  { x: '50%', y: '30%', delay: 110 },
  { x: '76%', y: '42%', delay: 220 },
];

export function MealCelebration({
  onFinish,
  title,
  message,
}: {
  onFinish: () => void;
  title?: string;
  message?: string;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const timer = window.setTimeout(onFinish, MEAL_CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return createPortal(
    <div aria-hidden="true" className="meal-celebration">
      {bursts.map((burst, burstIndex) => (
        <div
          className="meal-celebration__burst"
          key={burstIndex}
          style={
            { left: burst.x, top: burst.y, '--burst-delay': `${burst.delay}ms` } as CSSProperties
          }
        >
          <span className="meal-celebration__ring" />
          {Array.from({ length: 32 }, (_, index) => {
            const angle = (index / 32) * Math.PI * 2 + burstIndex * 0.14;
            const reach = 0.65 + (index % 5) * 0.12;
            const x = Math.cos(angle) * reach;
            const y = Math.sin(angle) * reach;
            return (
              <span
                className={`meal-celebration__spark${index % 3 === 0 ? ' is-round' : ''}`}
                key={index}
                style={
                  {
                    '--spark-x': `calc(${x.toFixed(3)} * var(--burst-radius))`,
                    '--spark-y': `calc(${y.toFixed(3)} * var(--burst-radius))`,
                    '--spark-fall-x': `calc(${(x * 1.12).toFixed(3)} * var(--burst-radius))`,
                    '--spark-fall-y': `calc(${(y * 1.08).toFixed(3)} * var(--burst-radius) + 48px)`,
                    '--spark-angle': `${(angle * 180) / Math.PI + 90}deg`,
                    '--spark-color': colors[(index + burstIndex) % colors.length],
                    '--spark-duration': `${1050 + (index % 4) * 100}ms`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      ))}
      <div className="meal-celebration__message">
        <span>
          <AppIcon name="check" size={22} />
        </span>
        <div>
          <strong>{title ?? t('Mâm cơm đã đủ món!')}</strong>
          <small>{message ?? t('Chúc nhà mình ngon miệng')}</small>
        </div>
      </div>
    </div>,
    document.body,
  );
}

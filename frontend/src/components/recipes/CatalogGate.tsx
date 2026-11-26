import type { ReactNode } from 'react';

import { useI18n } from '@/features/i18n/I18nContext';
import {
  getRecipeLanguage,
  useRecipeCatalogReady,
  useRecipeCatalogSource,
} from '@/features/i18n/recipeContent';
import { translate } from '@/features/i18n/translate';
import './CatalogGate.css';

/** Thẻ giữ chỗ cùng tỉ lệ với thẻ món để nội dung thật thay vào không làm xô lệch bố cục. */
export function CatalogSkeletonCard() {
  return (
    <div aria-hidden="true" className="catalog-skeleton-card">
      <span className="catalog-skeleton catalog-skeleton-card__media" />
      <span className="catalog-skeleton catalog-skeleton__line" />
      <span className="catalog-skeleton catalog-skeleton__line catalog-skeleton__line--short" />
    </div>
  );
}

function visibleCards() {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  if (width < 680) return 1;
  if (width < 960) return 2;
  return 3;
}

/** Băng chuyền giữ chỗ trong lúc kho món đang tải (cùng khung với ShowcaseCarousel). */
export function CatalogSkeletonCarousel({ bleed = false }: { bleed?: boolean }) {
  const { t } = useI18n();
  const count = visibleCards();
  return (
    <div className={`showcase-carousel${bleed ? ' showcase-carousel--bleed' : ''}`} role="status">
      <span className="visually-hidden">{t('Đang tải…')}</span>
      <div className="showcase-carousel__stage">
        <div className="showcase-carousel__viewport">
          <div className="showcase-carousel__track" data-visible-count={count}>
            {Array.from({ length: count + 1 }, (_, index) => (
              <div className="showcase-carousel__item" key={index}>
                <CatalogSkeletonCard />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type SkeletonVariant = 'grid' | 'detail';

export function CatalogPageSkeleton({ variant = 'grid' }: { variant?: SkeletonVariant }) {
  const { t } = useI18n();
  return (
    <div className="container catalog-page-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{t('Đang tải…')}</span>
      {variant === 'detail' ? (
        <div aria-hidden="true" className="catalog-page-skeleton__detail">
          <span className="catalog-skeleton catalog-page-skeleton__image" />
          <div className="catalog-page-skeleton__copy">
            <span className="catalog-skeleton catalog-page-skeleton__title" />
            <span className="catalog-skeleton catalog-skeleton__line" />
            <span className="catalog-skeleton catalog-skeleton__line" />
            <span className="catalog-skeleton catalog-skeleton__line catalog-skeleton__line--short" />
          </div>
        </div>
      ) : (
        <>
          <div aria-hidden="true" className="catalog-page-skeleton__heading">
            <span className="catalog-skeleton catalog-page-skeleton__title" />
            <span className="catalog-skeleton catalog-skeleton__line catalog-skeleton__line--short" />
          </div>
          <div className="catalog-page-skeleton__grid">
            {Array.from({ length: 6 }, (_, index) => (
              <CatalogSkeletonCard key={index} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Chỉ dựng trang cần kho món khi kho đã sẵn sàng; trước đó hiện khung giữ chỗ. Trang được mount
 * sau khi có dữ liệu nên mọi chỗ đọc `recipes` đồng bộ đều thấy kho đầy đủ (không báo 404 sớm).
 */
export function CatalogGate({
  children,
  variant = 'grid',
}: {
  children: ReactNode;
  variant?: SkeletonVariant;
}) {
  const ready = useRecipeCatalogReady();
  return ready ? children : <CatalogPageSkeleton variant={variant} />;
}

/** Báo khi đang dùng bản lưu sẵn hoặc chỉ có các món đóng gói sẵn (nằm ngoài I18nProvider). */
export function CatalogStatusNotice() {
  const source = useRecipeCatalogSource();
  if (source !== 'offline' && source !== 'fallback') return null;
  const t = (text: string) => translate(getRecipeLanguage(), text);
  return (
    <div className="catalog-unavailable" role="status">
      {source === 'offline'
        ? t('Kho món tải chậm, đang tạm dùng bản lưu sẵn.')
        : t('Chưa kết nối được kho món. Đang hiển thị các công thức có sẵn.')}{' '}
      <button onClick={() => window.location.reload()} type="button">
        {t('Thử lại')}
      </button>
    </div>
  );
}

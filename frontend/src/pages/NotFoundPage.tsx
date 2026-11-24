import { Link } from 'react-router';
import { useI18n } from '@/features/i18n/I18nContext';

/** `recipe` dùng khi mã món không tồn tại để dẫn thẳng về Kho món. */
export function NotFoundPage({ kind = 'page' }: { kind?: 'page' | 'recipe' }) {
  const { t } = useI18n();
  return (
    <section className="section">
      <div className="container empty-page">
        <p className="eyebrow">{t('Lỗi 404')}</p>
        <h1>{kind === 'recipe' ? t('Không tìm thấy món ăn') : t('Không tìm thấy trang')}</h1>
        <p>{t('Đường dẫn có thể đã thay đổi hoặc không còn tồn tại.')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          <Link className="button button--primary" to="/recipes">
            {t('Xem kho món')}
          </Link>
          <Link className="button button--outline" to="/">
            {t('Về trang chủ')}
          </Link>
        </div>
      </div>
    </section>
  );
}

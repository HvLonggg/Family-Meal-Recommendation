import { Link } from 'react-router';
import { useI18n } from '@/features/i18n/I18nContext';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section className="section">
      <div className="container empty-page">
        <p className="eyebrow">{t('Lỗi 404')}</p>
        <h1>{t('Không tìm thấy trang')}</h1>
        <p>{t('Đường dẫn có thể đã thay đổi hoặc không còn tồn tại.')}</p>
        <Link className="button button--primary" to="/">
          {t('Về trang chủ')}
        </Link>
      </div>
    </section>
  );
}

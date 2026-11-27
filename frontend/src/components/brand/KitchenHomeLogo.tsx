import { useI18n } from '@/features/i18n/I18nContext';

interface KitchenHomeLogoProps {
  compact?: boolean;
  /** "light": bản logo chữ "BẾP VIỆT" màu kem, dùng trên nền tối (chân trang, admin). */
  tone?: 'default' | 'light';
}

const LOGO_SRC = {
  default: '/images/brand/bep-viet-logo.png',
  light: '/images/brand/bep-viet-logo-light.png',
} as const;

export function KitchenHomeLogo({ compact = false, tone = 'default' }: KitchenHomeLogoProps) {
  const { t } = useI18n();
  return (
    <span className={`kitchen-logo${compact ? ' kitchen-logo--compact' : ''}`}>
      <img className="kitchen-logo__image" src={LOGO_SRC[tone]} alt={t('Bếp Việt')} />
    </span>
  );
}

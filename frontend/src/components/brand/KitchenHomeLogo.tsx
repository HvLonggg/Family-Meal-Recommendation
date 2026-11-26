import { useI18n } from '@/features/i18n/I18nContext';

interface KitchenHomeLogoProps {
  compact?: boolean;
}

export function KitchenHomeLogo({ compact = false }: KitchenHomeLogoProps) {
  const { t } = useI18n();
  return (
    <span className={`kitchen-logo${compact ? ' kitchen-logo--compact' : ''}`}>
      <img
        className="kitchen-logo__image"
        src="/images/brand/bep-viet-logo.png"
        alt={t('Bếp Việt')}
      />
    </span>
  );
}

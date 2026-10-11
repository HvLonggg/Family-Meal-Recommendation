import { AppIcon } from '@/components/common/AppIcon';
import { contactInfo, mapEmbedUrl, mapLinkUrl } from '@/config/contact';
import { useI18n } from '@/features/i18n/I18nContext';

interface LocationMapProps {
  className?: string;
  height?: number;
}

/** Bản đồ vị trí Bếp Việt kèm địa chỉ và nút mở Google Maps (chỉ đường trên điện thoại). */
export function LocationMap({ className = '', height = 180 }: LocationMapProps) {
  const { language, t } = useI18n();
  return (
    <figure className={`location-map ${className}`.trim()}>
      <div className="location-map__frame" style={{ height }}>
        <iframe
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={mapEmbedUrl(contactInfo.mapQuery, language)}
          title={t('Bản đồ vị trí Bếp Việt')}
        />
      </div>
      <figcaption>
        <span className="location-map__address">
          <AppIcon name="pin" size={16} />
          {contactInfo.address}
        </span>
        <a href={mapLinkUrl(contactInfo.mapQuery)} rel="noreferrer" target="_blank">
          {t('Chỉ đường')}
          <AppIcon name="external" size={14} />
        </a>
      </figcaption>
    </figure>
  );
}

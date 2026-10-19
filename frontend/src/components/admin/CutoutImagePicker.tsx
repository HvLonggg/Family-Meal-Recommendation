import { useId, useState, type ChangeEvent } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';

const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Không đọc được ảnh.'));
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
  });
}

/** Đo độ trong suốt ở viền ảnh theo tiêu chí của máy chủ. */
async function borderTransparency(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return 1;
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3] ?? 255;
  let clear = 0;
  let total = 0;
  for (let x = 0; x < width; x += 2) {
    for (const y of [0, height - 1]) {
      total += 1;
      if (alphaAt(x, y) < 24) clear += 1;
    }
  }
  for (let y = 0; y < height; y += 2) {
    for (const x of [0, width - 1]) {
      total += 1;
      if (alphaAt(x, y) < 24) clear += 1;
    }
  }
  return clear / Math.max(1, total);
}

interface CutoutImagePickerProps {
  /** Ảnh hiện tại (khi sửa món); ảnh mới chọn sẽ hiển thị thay thế. */
  currentSrc?: string;
  onChange: (dataUrl: string | null) => void;
  required?: boolean;
  value: string | null;
}

export function CutoutImagePicker({
  currentSrc,
  onChange,
  required = false,
  value,
}: CutoutImagePickerProps) {
  const { t } = useI18n();
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const preview = value ?? currentSrc;

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!['image/png', 'image/webp'].includes(file.type)) {
      setError(t('Ảnh tách nền cần ở định dạng PNG hoặc WebP (nền trong suốt).'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('Ảnh vượt quá 8 MB.'));
      return;
    }
    setChecking(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      if ((await borderTransparency(dataUrl)) < 0.6) {
        setError(
          t('Ảnh này vẫn còn nền. Hãy tách nền món ăn trước rồi tải lại ảnh PNG/WebP trong suốt.'),
        );
        return;
      }
      onChange(dataUrl);
    } catch {
      setError(t('Không đọc được ảnh, vui lòng chọn tệp khác.'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={`cutout-picker${preview ? ' has-image' : ''}${error ? ' has-error' : ''}`}>
      <div className="cutout-picker__stage">
        {preview ? (
          <img alt={t('Xem trước ảnh món')} src={preview} />
        ) : (
          <span className="cutout-picker__placeholder">
            <AppIcon name="camera" size={30} />
            <strong>{t('Ảnh món đã tách nền')}</strong>
            <small>{t('PNG/WebP nền trong suốt · tối đa 8 MB')}</small>
          </span>
        )}
      </div>
      <div className="cutout-picker__actions">
        <label className="button button--secondary" htmlFor={inputId}>
          <AppIcon name="upload" size={16} />
          <span>
            {checking
              ? t('Đang kiểm tra ảnh…')
              : preview
                ? t('Chọn ảnh khác')
                : t('Tải ảnh tách nền')}
          </span>
        </label>
        <input
          accept="image/png,image/webp"
          className="visually-hidden"
          disabled={checking}
          id={inputId}
          onChange={(event) => void pick(event)}
          required={required && !value}
          type="file"
        />
        {value && currentSrc ? (
          <button className="text-button" onClick={() => onChange(null)} type="button">
            {t('Giữ ảnh cũ')}
          </button>
        ) : null}
        <small>
          {t('Hệ thống tự căn giữa món trên khung 16:9 và đặt lên nền kem khi hiển thị.')}
        </small>
      </div>
      {error ? (
        <p className="cutout-picker__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import { useRef } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';

interface SearchFieldProps {
  actionLabel?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export function SearchField({
  actionLabel,
  label,
  onChange,
  placeholder,
  value,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  return (
    <div className="search-field">
      <span className="search-field__icon">
        <AppIcon name="search" size={20} />
      </span>
      <input
        aria-label={label}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
      />
      {value.length > 0 && (
        <button
          aria-label={t('Xóa từ khóa')}
          className="search-field__clear"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          type="button"
        >
          <AppIcon name="close" size={16} />
        </button>
      )}
      {actionLabel && (
        <button className="search-field__submit" type="submit">
          {actionLabel}
          <AppIcon name="arrow" size={16} />
        </button>
      )}
    </div>
  );
}

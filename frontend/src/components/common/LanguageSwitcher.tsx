import { useState, type KeyboardEvent } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import type { Language } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';

const options: { id: Language; short: string; label: string }[] = [
  { id: 'vi', short: 'VI', label: 'Tiếng Việt' },
  { id: 'en', short: 'EN', label: 'English' },
];

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  // Bỏ animation ở lần tải trang đầu.
  const [hasSwitched, setHasSwitched] = useState(false);
  const choose = (next: Language) => {
    if (next === language) return;
    setHasSwitched(true);
    setLanguage(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = event.key === 'ArrowLeft' ? 'vi' : 'en';
    choose(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`button[lang='${next}']`)?.focus();
  };

  return (
    <div
      aria-label={t('Ngôn ngữ')}
      className={`language-switcher ${className}`.trim()}
      data-active={language}
      data-animate={hasSwitched || undefined}
      onKeyDown={onKeyDown}
      role="group"
    >
      <span aria-hidden="true" className="language-switcher__globe">
        <AppIcon name="globe" size={15} />
      </span>
      <div className="language-switcher__track">
        <span aria-hidden="true" className="language-switcher__thumb" />
        {options.map((option) => (
          <button
            aria-label={option.label}
            aria-pressed={language === option.id}
            className={language === option.id ? 'is-active' : ''}
            key={option.id}
            lang={option.id}
            onClick={() => choose(option.id)}
            tabIndex={language === option.id ? 0 : -1}
            title={option.label}
            type="button"
          >
            {option.short}
          </button>
        ))}
      </div>
    </div>
  );
}

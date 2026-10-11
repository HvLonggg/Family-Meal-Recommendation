import type { Language } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';

const options: { id: Language; short: string; label: string }[] = [
  { id: 'vi', short: 'VI', label: 'Tiếng Việt' },
  { id: 'en', short: 'EN', label: 'English' },
];

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div
      aria-label={t('Ngôn ngữ')}
      className={`language-switcher ${className}`.trim()}
      role="group"
    >
      {options.map((option) => (
        <button
          aria-label={option.label}
          aria-pressed={language === option.id}
          className={language === option.id ? 'is-active' : ''}
          key={option.id}
          lang={option.id}
          onClick={() => setLanguage(option.id)}
          title={option.label}
          type="button"
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}

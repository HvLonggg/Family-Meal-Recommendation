import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { recipes } from '@/data/recipes';
import { pickRecipeSearchSuggestions } from '@/data/recipeSearchSuggestions';
import { useI18n } from '@/features/i18n/I18nContext';

const ROTATION_INTERVAL_MS = 6500;

export function RecipeSearchSuggestions() {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState(() => pickRecipeSearchSuggestions(recipes));
  const isInteracting = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden' && !isInteracting.current) {
        setSuggestions(pickRecipeSearchSuggestions(recipes));
      }
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <nav
      aria-label={t('Từ khóa tìm kiếm gợi ý')}
      className="hero-suggestions"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          isInteracting.current = false;
        }
      }}
      onFocusCapture={() => {
        isInteracting.current = true;
      }}
      onMouseEnter={() => {
        isInteracting.current = true;
      }}
      onMouseLeave={() => {
        isInteracting.current = false;
      }}
    >
      <span>{t('Gợi ý:')}</span>
      {suggestions.map((query) => (
        <Link
          className="hero-suggestions__keyword"
          key={query}
          to={`/recipes?q=${encodeURIComponent(query)}`}
        >
          {t(query)}
        </Link>
      ))}
    </nav>
  );
}

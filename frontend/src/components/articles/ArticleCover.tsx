import familyMealImage from '@/assets/auth/mam-com-nha.webp';
import { getRecipe } from '@/data/recipes';
import type { ArticleSummary } from '@/features/articles/articlesApi';
import { apiUrl } from '@/lib/api/client';

interface ArticleCoverProps {
  article: Pick<ArticleSummary, 'cover_url' | 'recipe_slug' | 'title'>;
  className?: string;
  eager?: boolean;
}

function articleCoverSrc(article: Pick<ArticleSummary, 'cover_url' | 'recipe_slug'>) {
  return (
    apiUrl(article.cover_url) ??
    (article.recipe_slug ? getRecipe(article.recipe_slug)?.image : undefined) ??
    familyMealImage
  );
}

export function ArticleCover({ article, className = '', eager = false }: ArticleCoverProps) {
  return (
    <img
      alt=""
      className={`article-cover ${className}`.trim()}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      src={articleCoverSrc(article)}
    />
  );
}

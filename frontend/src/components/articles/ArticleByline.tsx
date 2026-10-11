import { UserAvatar } from '@/components/common/UserAvatar';
import type { ArticleSummary } from '@/features/articles/articlesApi';
import { useI18n } from '@/features/i18n/I18nContext';

interface ArticleBylineProps {
  article: Pick<ArticleSummary, 'author' | 'published_at' | 'updated_at' | 'reading_minutes'>;
  compact?: boolean;
}

export function ArticleByline({ article, compact = false }: ArticleBylineProps) {
  const { formatDate, t } = useI18n();
  const name =
    article.author.display === 'editorial'
      ? t('Ban biên tập Bếp Việt')
      : article.author.display === 'anonymous'
        ? t('Thành viên Bếp Việt')
        : article.author.full_name;
  return (
    <div className={`article-byline${compact ? ' article-byline--compact' : ''}`}>
      <UserAvatar name={name} size={compact ? 28 : 38} src={article.author.avatar_url} />
      <span>
        <strong>{name}</strong>
        <small>
          {formatDate(article.published_at ?? article.updated_at, { dateStyle: 'medium' })} ·{' '}
          {t('{minutes} phút đọc', { minutes: article.reading_minutes })}
        </small>
      </span>
    </div>
  );
}

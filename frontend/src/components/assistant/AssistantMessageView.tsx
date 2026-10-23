import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { DragonMascot } from '@/components/assistant/DragonMascot';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { dishImage } from '@/data/dishImages';
import { recipeText } from '@/data/recipes';
import type { AssistantMessage, AssistantSource } from '@/features/assistant/assistantApi';
import { useI18n } from '@/features/i18n/I18nContext';

const SOURCE_ICONS: Record<AssistantSource['kind'], IconName> = {
  recipe: 'chef',
  article: 'book',
  guide: 'globe',
  doc: 'file',
};

/** Hiển thị Markdown giới hạn, không chèn HTML thô. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined)
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>);
    else nodes.push(<em key={`${keyPrefix}-i${index}`}>{match[2]}</em>);
    last = match.index + match[0].length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key}>
        {list.map((item, index) => (
          <li key={index}>{inline(item, `${key}-${index}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  text.split('\n').forEach((line, index) => {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1] ?? '');
      return;
    }
    flush(`l${index}`);
    if (line.trim()) blocks.push(<p key={`p${index}`}>{inline(line, `p${index}`)}</p>);
  });
  flush('end');
  return <>{blocks}</>;
}

interface AssistantMessageViewProps {
  message: AssistantMessage;
  isLatest: boolean;
  onSuggestion: (text: string) => void;
  onRetry?: () => void;
  onSpeak?: () => void;
  speaking?: boolean;
  canSpeak: boolean;
  onNavigate: () => void;
}

export function AssistantMessageView({
  canSpeak,
  isLatest,
  message,
  onNavigate,
  onRetry,
  onSpeak,
  onSuggestion,
  speaking = false,
}: AssistantMessageViewProps) {
  const { formatDate, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const time = formatDate(message.created_at, { hour: '2-digit', minute: '2-digit' });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li
      className={`rc-message ${isUser ? 'is-user' : 'is-bot'}${message.failed ? ' is-failed' : ''}`}
    >
      {!isUser ? (
        <span aria-hidden="true" className="rc-message__avatar">
          <DragonMascot mood="happy" size={36} still variant="face" />
        </span>
      ) : null}
      <div className="rc-message__stack">
        {message.attachments.length ? (
          <div className="rc-message__files">
            {message.attachments.map((file, index) =>
              file.kind === 'image' && file.thumbnail ? (
                <img
                  alt={file.name}
                  className="rc-message__thumb"
                  key={`${file.name}-${index}`}
                  src={file.thumbnail}
                />
              ) : (
                <span className="rc-file-chip" key={`${file.name}-${index}`}>
                  <AppIcon name={file.kind === 'image' ? 'camera' : 'file'} size={14} />
                  <span>{file.name}</span>
                </span>
              ),
            )}
          </div>
        ) : null}
        {message.content ? (
          <div className="rc-message__bubble">
            <RichText text={message.content} />
          </div>
        ) : null}

        {message.recipes.length ? (
          <ul className="rc-recipes" aria-label={t('Món Chú Rồng gợi ý')}>
            {message.recipes.map((recipe) => (
              <li key={recipe.slug}>
                <Link onClick={onNavigate} to={`/recipes/${recipe.slug}`}>
                  <span className="rc-recipes__media">
                    <img
                      alt=""
                      loading="lazy"
                      {...dishImage(recipe.slug, recipe.image_path, '120px')}
                    />
                  </span>
                  <span className="rc-recipes__body">
                    <strong>{recipeText(recipe.name)}</strong>
                    <small>
                      <AppIcon name="clock" size={12} />{' '}
                      {t('{minutes} phút', { minutes: recipe.minutes })} · {t(recipe.region)}
                    </small>
                  </span>
                  <AppIcon name="arrow" size={15} />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {message.actions.length ? (
          <div className="rc-actions">
            {message.actions.map((action) => (
              <Link
                className="rc-actions__link"
                key={action.to + action.label}
                onClick={onNavigate}
                to={action.to}
              >
                {t(action.label)} <AppIcon name="arrow" size={14} />
              </Link>
            ))}
          </div>
        ) : null}

        {message.sources?.length ? (
          <div className="rc-sources" aria-label={t('Nguồn tham khảo')}>
            <span className="rc-sources__label">{t('Nguồn')}</span>
            {message.sources.map((source) => {
              const label = (
                <>
                  <AppIcon name={SOURCE_ICONS[source.kind]} size={12} />
                  <span>
                    {source.kind === 'recipe' ? recipeText(source.title) : t(source.title)}
                  </span>
                </>
              );
              // Tài liệu nội bộ do quản trị viên dạy không có trang công khai để mở.
              return source.url ? (
                <Link
                  className="rc-sources__link"
                  key={source.url}
                  onClick={onNavigate}
                  title={source.title}
                  to={source.url}
                >
                  {label}
                </Link>
              ) : (
                <span
                  className="rc-sources__link rc-sources__link--static"
                  key={`${source.kind}:${source.title}`}
                  title={source.title}
                >
                  {label}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="rc-message__meta">
          <time dateTime={message.created_at}>{time}</time>
          {!isUser && message.mode === 'ai' ? (
            <span className="rc-message__badge">
              <AppIcon name="sparkles" size={11} /> AI
            </span>
          ) : null}
          {!isUser && message.content ? (
            <span className="rc-message__tools">
              <button
                aria-label={copied ? t('Đã sao chép') : t('Sao chép câu trả lời')}
                onClick={() => void copy()}
                title={copied ? t('Đã sao chép') : t('Sao chép')}
                type="button"
              >
                <AppIcon name={copied ? 'check' : 'copy'} size={14} />
              </button>
              {canSpeak && onSpeak ? (
                <button
                  aria-label={speaking ? t('Dừng đọc') : t('Đọc to câu trả lời')}
                  aria-pressed={speaking}
                  onClick={onSpeak}
                  title={speaking ? t('Dừng đọc') : t('Đọc to')}
                  type="button"
                >
                  <AppIcon name={speaking ? 'stop' : 'volume'} size={14} />
                </button>
              ) : null}
            </span>
          ) : null}
          {message.failed && onRetry ? (
            <button className="rc-message__retry" onClick={onRetry} type="button">
              <AppIcon name="refresh" size={13} /> {t('Gửi lại')}
            </button>
          ) : null}
        </div>

        {isLatest && !isUser && message.suggestions.length ? (
          <div className="rc-suggestions" role="group" aria-label={t('Gợi ý câu hỏi')}>
            {message.suggestions.map((suggestion) => (
              <Fragment key={suggestion}>
                <button onClick={() => onSuggestion(suggestion)} type="button">
                  {suggestion}
                </button>
              </Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { ArticleCover } from '@/components/articles/ArticleCover';
import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { LoadingBlock, Notice, StatusBadge } from '@/components/ui/Workspace';
import { getRecipe, recipes } from '@/data/recipes';
import {
  articleCategories,
  articleStatusLabels,
  articleStatusTone,
  createArticle,
  getArticleForEditing,
  updateArticle,
  type ArticleCategory,
  type ArticleDetail,
  type ArticleKind,
} from '@/features/articles/articlesApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';
import { resizeImageFile } from '@/lib/image';

interface Draft {
  title: string;
  excerpt: string;
  body: string;
  category: ArticleCategory;
  kind: ArticleKind;
  recipeName: string;
  cover: string | null;
  removeCover: boolean;
}

const emptyDraft = (kind: ArticleKind): Draft => ({
  title: '',
  excerpt: '',
  body: '',
  category: kind === 'editorial' ? 'tips' : 'kitchen_story',
  kind,
  recipeName: '',
  cover: null,
  removeCover: false,
});

function fromArticle(article: ArticleDetail): Draft {
  return {
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    category: article.category,
    kind: article.kind,
    recipeName: article.recipe_slug ? (getRecipe(article.recipe_slug)?.name ?? '') : '',
    cover: null,
    removeCover: false,
  };
}

export function StoryEditorPage() {
  const { id } = useParams();
  if (id) return <EditStory id={id} />;
  return <StoryForm />;
}

function EditStory({ id }: { id: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.role === 'admin';
  const article = useQuery({
    queryKey: ['article-edit', id],
    queryFn: ({ signal }) => getArticleForEditing(id, signal),
    // Luôn lấy bản mới nhất: biểu mẫu khởi tạo một lần từ dữ liệu này.
    gcTime: 0,
    staleTime: 0,
  });
  if (article.isLoading || article.isFetching)
    return <LoadingBlock label={t('Đang mở bài viết…')} />;
  if (article.isError || !article.data) {
    return (
      <div className="container section">
        <Notice tone="danger">{errorMessage(article.error, t)}</Notice>
        {isAdmin ? (
          <Link className="button button--outline" to="/admin/articles">
            {t('Về danh sách bài viết')}
          </Link>
        ) : (
          <Link className="button button--outline" to="/account/stories">
            {t('Về câu chuyện của tôi')}
          </Link>
        )}
      </div>
    );
  }
  return <StoryForm article={article.data} key={article.data.updated_at} />;
}

function StoryForm({ article }: { article?: ArticleDetail }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  // Quản trị viên viết từ khu quản trị nên mặc định là bài biên tập.
  const initialKind: ArticleKind =
    isAdmin && params.get('kind') !== 'story' ? 'editorial' : 'story';
  const [draft, setDraft] = useState<Draft>(() =>
    article ? fromArticle(article) : emptyDraft(initialKind),
  );
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (submit: boolean) => {
      const recipe = recipes.find(
        (item) =>
          item.name.toLocaleLowerCase('vi-VN') ===
          draft.recipeName.trim().toLocaleLowerCase('vi-VN'),
      );
      const payload = {
        title: draft.title,
        excerpt: draft.excerpt,
        body: draft.body,
        category: draft.category,
        kind: draft.kind,
        recipe_slug: recipe?.slug ?? null,
        cover_image: draft.cover,
        remove_cover: draft.removeCover,
        submit,
      };
      return article ? updateArticle(article.id, payload) : createArticle(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['my-articles'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.removeQueries({ queryKey: ['article-edit'] });
      const destination = isAdmin
        ? '/admin/articles'
        : saved.status === 'published'
          ? `/articles/${saved.slug}`
          : '/account/stories';
      await navigate(destination, { replace: true });
    },
    onError: (saveError) => setError(errorMessage(saveError, t)),
  });

  const cover = useMutation({
    mutationFn: (file: File) => resizeImageFile(file, { maxSize: 1400, maxBytes: 760 * 1024 }),
    onSuccess: (dataUrl) =>
      setDraft((current) => ({ ...current, cover: dataUrl, removeCover: false })),
    onError: (coverError) => setError(errorMessage(coverError, t)),
  });

  if (!user) return null;
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setError('');
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  const hasExistingCover = Boolean(article?.cover_url) && !draft.removeCover;
  const coverPreview = draft.cover;
  const valid =
    draft.title.trim().length >= 5 &&
    draft.excerpt.trim().length >= 10 &&
    draft.body.trim().length >= 50;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) {
      setError(
        t('Vui lòng nhập tiêu đề (≥ 5 ký tự), tóm tắt (≥ 10 ký tự) và nội dung (≥ 50 ký tự).'),
      );
      return;
    }
    save.mutate(true);
  };
  const pickCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) cover.mutate(file);
  };

  return (
    <div className={isAdmin ? 'admin-editor' : 'page-wrap'}>
      {/* Trong khu quản trị, tiêu đề đã nằm ở thanh trên cùng. */}
      {isAdmin ? null : (
        <section className="page-hero page-hero--compact">
          <div className="container">
            <span className="section-label">
              {draft.kind === 'editorial' ? t('Bài viết biên tập') : t('Câu chuyện căn bếp')}
            </span>
            <h1>{article ? t('Chỉnh sửa bài viết') : t('Chia sẻ câu chuyện căn bếp')}</h1>
            <p>
              {t(
                'Kể hành trình nấu một món ăn của bạn. Ban biên tập sẽ duyệt trước khi bài hiển thị công khai.',
              )}
            </p>
          </div>
        </section>
      )}
      <section className="content-section">
        <div className="container editor-layout">
          <form className="editor-form" onSubmit={submit}>
            {article ? (
              <div className="editor-form__status">
                <StatusBadge tone={articleStatusTone[article.status]}>
                  {t(articleStatusLabels[article.status])}
                </StatusBadge>
                {article.moderation_note ? (
                  <span>
                    {t('Ghi chú từ ban biên tập')}: {article.moderation_note}
                  </span>
                ) : null}
              </div>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}

            <label className="ws-field">
              <span>{t('Tiêu đề')} *</span>
              <input
                maxLength={200}
                onChange={(event) => update('title', event.target.value)}
                placeholder={t('Ví dụ: Nồi thịt kho Tết của bà ngoại')}
                required
                value={draft.title}
              />
            </label>
            <div className="ws-field">
              <label className="ws-field">
                <span>{t('Tóm tắt ngắn')} *</span>
                <textarea
                  aria-describedby="story-excerpt-count"
                  maxLength={400}
                  onChange={(event) => update('excerpt', event.target.value)}
                  placeholder={t('Một hai câu giới thiệu để người đọc muốn mở bài.')}
                  required
                  rows={2}
                  value={draft.excerpt}
                />
              </label>
              <small id="story-excerpt-count">
                {t('{count}/400 ký tự', { count: draft.excerpt.length })}
              </small>
            </div>
            <div className="ws-grid-2">
              <label className="ws-field">
                <span>{t('Chuyên mục')}</span>
                <select
                  onChange={(event) => update('category', event.target.value as ArticleCategory)}
                  value={draft.category}
                >
                  {articleCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {t(item.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ws-field">
                <span>{t('Món ăn liên quan')}</span>
                <input
                  list="story-recipe-options"
                  onChange={(event) => update('recipeName', event.target.value)}
                  placeholder={t('Gõ để chọn món trong kho (không bắt buộc)')}
                  value={draft.recipeName}
                />
                <datalist id="story-recipe-options">
                  {recipes.map((recipe) => (
                    <option key={recipe.slug} value={recipe.name} />
                  ))}
                </datalist>
              </label>
            </div>
            {isAdmin ? (
              <div className="ws-fieldset">
                <span className="ws-fieldset__label">{t('Loại bài')}</span>
                <div className="segmented-control segmented-control--soft">
                  {(['story', 'editorial'] as const).map((kind) => (
                    <button
                      aria-pressed={draft.kind === kind}
                      className={draft.kind === kind ? 'is-active' : ''}
                      key={kind}
                      onClick={() => update('kind', kind)}
                      type="button"
                    >
                      {kind === 'story' ? t('Câu chuyện căn bếp') : t('Bài viết biên tập')}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="ws-fieldset">
              <span className="ws-fieldset__label">{t('Ảnh bìa')}</span>
              <div className="cover-picker">
                {coverPreview ? (
                  <img alt="" src={coverPreview} />
                ) : hasExistingCover && article ? (
                  <ArticleCover article={article} />
                ) : (
                  <div className="cover-picker__placeholder">
                    <AppIcon name="camera" size={26} />
                    <small>{t('Chưa có ảnh bìa. Bài sẽ dùng ảnh của món liên quan.')}</small>
                  </div>
                )}
                <div className="cover-picker__actions">
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={t('Chọn ảnh bìa')}
                    className="visually-hidden"
                    onChange={pickCover}
                    ref={fileRef}
                    type="file"
                  />
                  <Button
                    isLoading={cover.isPending}
                    onClick={() => fileRef.current?.click()}
                    variant="secondary"
                  >
                    <AppIcon name="upload" size={16} /> {t('Tải ảnh lên')}
                  </Button>
                  {coverPreview || hasExistingCover ? (
                    <button
                      className="text-button text-button--danger"
                      onClick={() =>
                        setDraft((current) => ({ ...current, cover: null, removeCover: true }))
                      }
                      type="button"
                    >
                      {t('Gỡ ảnh')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="ws-field">
              <div className="editor-form__body-head">
                <span>{t('Nội dung câu chuyện')} *</span>
                <div className="segmented-control segmented-control--soft">
                  <button
                    aria-pressed={!preview}
                    className={!preview ? 'is-active' : ''}
                    onClick={() => setPreview(false)}
                    type="button"
                  >
                    {t('Soạn thảo')}
                  </button>
                  <button
                    aria-pressed={preview}
                    className={preview ? 'is-active' : ''}
                    onClick={() => setPreview(true)}
                    type="button"
                  >
                    {t('Xem trước')}
                  </button>
                </div>
              </div>
              {preview ? (
                <div className="editor-preview article-reader__body">
                  {draft.body.split(/\n{2,}/).map((block, index) => (
                    <p key={index}>{block}</p>
                  ))}
                </div>
              ) : (
                <textarea
                  aria-label={t('Nội dung câu chuyện')}
                  maxLength={20000}
                  onChange={(event) => update('body', event.target.value)}
                  placeholder={t(
                    'Món ăn này gắn với kỷ niệm nào? Bạn chuẩn bị nguyên liệu ra sao, có mẹo gì đặc biệt? Để một dòng trống giữa các đoạn.',
                  )}
                  required
                  rows={14}
                  value={draft.body}
                />
              )}
              <small>
                {t('{words} từ · khoảng {minutes} phút đọc', {
                  words,
                  minutes: Math.max(1, Math.round(words / 200)),
                })}
              </small>
            </div>

            <div className="editor-form__actions">
              <Link className="text-button" to={article ? '/account/stories' : '/articles'}>
                {t('Hủy')}
              </Link>
              <Button
                disabled={save.isPending}
                onClick={() => {
                  if (!valid) {
                    setError(
                      t(
                        'Vui lòng nhập tiêu đề (≥ 5 ký tự), tóm tắt (≥ 10 ký tự) và nội dung (≥ 50 ký tự).',
                      ),
                    );
                    return;
                  }
                  save.mutate(false);
                }}
                variant="secondary"
              >
                <AppIcon name="save" size={16} /> {t('Lưu nháp')}
              </Button>
              <Button isLoading={save.isPending} type="submit">
                <AppIcon name="check" size={16} /> {isAdmin ? t('Xuất bản') : t('Gửi duyệt')}
              </Button>
            </div>
          </form>
          <aside className="submission-guide">
            <h3>{t('Một câu chuyện hay thường có')}</h3>
            <ol>
              <li>{t('Bối cảnh: món ăn gắn với ai, dịp nào.')}</li>
              <li>{t('Nguyên liệu và mẹo chuẩn bị bạn tâm đắc.')}</li>
              <li>{t('Khoảnh khắc thành công (hoặc thất bại đáng nhớ).')}</li>
              <li>{t('Ảnh tự chụp, đủ sáng, không chèn chữ.')}</li>
            </ol>
            <p>
              {t(
                'Bạn có thể sửa hoặc xóa bài bất cứ lúc nào trong “Câu chuyện của tôi”. Bài đã chỉnh sửa sẽ được duyệt lại.',
              )}
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}

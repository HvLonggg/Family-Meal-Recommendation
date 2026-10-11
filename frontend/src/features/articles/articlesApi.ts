import { apiDelete, apiPatch, apiPost, apiRequest } from '@/lib/api/client';

export type ArticleKind = 'editorial' | 'story';
export type ArticleStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'hidden';
export type ArticleCategory = 'kitchen_story' | 'tips' | 'ingredients' | 'culture' | 'events';

export const articleCategories: { id: ArticleCategory; label: string }[] = [
  { id: 'kitchen_story', label: 'Câu chuyện căn bếp' },
  { id: 'tips', label: 'Mẹo vào bếp' },
  { id: 'ingredients', label: 'Nguyên liệu' },
  { id: 'culture', label: 'Văn hóa ẩm thực' },
  { id: 'events', label: 'Sự kiện' },
];

export const articleStatusLabels: Record<ArticleStatus, string> = {
  draft: 'Bản nháp',
  pending: 'Chờ duyệt',
  published: 'Đã xuất bản',
  rejected: 'Cần chỉnh sửa',
  hidden: 'Đã ẩn',
};

export interface ArticleAuthor {
  id: string | null;
  full_name: string;
  avatar_url: string | null;
  display: 'member' | 'editorial' | 'anonymous';
}

export interface ArticleSummary {
  id: string;
  slug: string;
  kind: ArticleKind;
  title: string;
  excerpt: string;
  category: ArticleCategory;
  recipe_slug: string | null;
  cover_url: string | null;
  status: ArticleStatus;
  moderation_note: string | null;
  reading_minutes: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author: ArticleAuthor;
}

export interface ArticleDetail extends ArticleSummary {
  body: string;
}

export interface ArticleList {
  data: ArticleSummary[];
  total: number;
}

export interface ArticleWrite {
  title: string;
  excerpt: string;
  body: string;
  category: ArticleCategory;
  recipe_slug: string | null;
  cover_image: string | null;
  kind: ArticleKind;
  submit: boolean;
  remove_cover?: boolean;
}

export interface ArticleQuery {
  kind?: ArticleKind;
  category?: ArticleCategory;
  q?: string;
  limit?: number;
  offset?: number;
}

function toSearch(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function listArticles(query: ArticleQuery, signal?: AbortSignal) {
  return apiRequest<ArticleList>(`/articles${toSearch({ ...query })}`, { signal });
}

export function getArticle(slug: string, signal?: AbortSignal) {
  return apiRequest<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`, { signal });
}

export function getArticleForEditing(id: string, signal?: AbortSignal) {
  return apiRequest<ArticleDetail>(`/articles/by-id/${encodeURIComponent(id)}`, { signal });
}

export function listMyArticles(signal?: AbortSignal) {
  return apiRequest<ArticleList>('/articles/mine', { signal });
}

export function createArticle(payload: ArticleWrite) {
  return apiPost<ArticleDetail>('/articles', payload);
}

export function updateArticle(id: string, payload: ArticleWrite) {
  return apiPatch<ArticleDetail>(`/articles/${encodeURIComponent(id)}`, payload);
}

export function deleteArticle(id: string) {
  return apiDelete(`/articles/${encodeURIComponent(id)}`);
}

export { toSearch };

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const articleStatusTone: Record<ArticleStatus, StatusTone> = {
  draft: 'neutral',
  pending: 'warning',
  published: 'success',
  rejected: 'danger',
  hidden: 'neutral',
};

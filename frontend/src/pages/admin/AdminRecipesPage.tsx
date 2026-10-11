import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/Button';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  StatusBadge,
} from '@/components/ui/Workspace';
import {
  adminKeys,
  getAdminRecipeInsights,
  listAdminRecipes,
  updateAdminRecipe,
  type AdminRecipe,
  type AdminRecipeFan,
  type AdminRecipeSort,
  type AdminRecipeUpdate,
} from '@/features/admin/adminApi';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const LIMIT = 15;
const regions = ['Bắc', 'Trung', 'Nam', 'Ba miền'];
const categories = [
  'Món mặn',
  'Món canh',
  'Món rau',
  'Món chay',
  'Món nước',
  'Món ăn sáng',
  'Món tráng miệng',
  'Món ăn kèm',
];
const difficulties = ['Dễ', 'Vừa', 'Trung bình', 'Khó'];
const sortLabels: Record<AdminRecipeSort, string> = {
  catalog: 'Theo mã món',
  updated: 'Mới cập nhật',
  favorites: 'Nhiều yêu thích nhất',
  planned: 'Lên kế hoạch nhiều nhất',
  cooked: 'Được nấu nhiều nhất',
};
const statusLabels: Record<AdminRecipe['status'], string> = {
  published: 'Đang hiển thị',
  hidden: 'Đã ẩn',
  draft: 'Bản nháp',
};

function toUpdate(recipe: AdminRecipe): AdminRecipeUpdate {
  return {
    name: recipe.name,
    excerpt: recipe.excerpt,
    region: recipe.region,
    category: recipe.category,
    difficulty: recipe.difficulty,
    prep_minutes: recipe.prep_minutes,
    cook_minutes: recipe.cook_minutes,
    base_servings: recipe.base_servings,
    status: recipe.status,
    tip: recipe.tip,
    serving: recipe.serving,
  };
}

export function AdminRecipesPage() {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const { offset, setFilter, values } = useAdminFilters([
    'q',
    'status',
    'region',
    'category',
    'sort',
  ] as const);
  const [search, setSearch] = useState(values.q);
  const [editing, setEditing] = useState<AdminRecipe | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const params = { ...values, limit: LIMIT, offset };
  const recipes = useQuery({
    queryKey: adminKeys.list('recipes', params),
    queryFn: ({ signal }) => listAdminRecipes(params, signal),
    placeholderData: keepPreviousData,
  });
  const mutation = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: AdminRecipeUpdate }) =>
      updateAdminRecipe(slug, payload),
    onSuccess: async () => {
      setEditing(null);
      setInspecting(null);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  return (
    <section className="admin-section">
      <div className="admin-filters">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilter('q', search.trim());
          }}
        >
          <SearchField
            actionLabel={t('Tìm')}
            label={t('Tìm món ăn')}
            onChange={setSearch}
            placeholder={t('Tên món, mã món…')}
            value={search}
          />
        </form>
        <select
          aria-label={t('Trạng thái')}
          onChange={(event) => setFilter('status', event.target.value)}
          value={values.status}
        >
          <option value="">{t('Mọi trạng thái')}</option>
          {(Object.keys(statusLabels) as AdminRecipe['status'][]).map((status) => (
            <option key={status} value={status}>
              {t(statusLabels[status])}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Vùng miền')}
          onChange={(event) => setFilter('region', event.target.value)}
          value={values.region}
        >
          <option value="">{t('Mọi vùng miền')}</option>
          {regions.map((region) => (
            <option key={region} value={region}>
              {t(region)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Loại món')}
          onChange={(event) => setFilter('category', event.target.value)}
          value={values.category}
        >
          <option value="">{t('Mọi loại món')}</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {t(category)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Sắp xếp')}
          onChange={(event) =>
            setFilter('sort', event.target.value === 'catalog' ? '' : event.target.value)
          }
          value={values.sort || 'catalog'}
        >
          {(Object.keys(sortLabels) as AdminRecipeSort[]).map((sort) => (
            <option key={sort} value={sort}>
              {t(sortLabels[sort])}
            </option>
          ))}
        </select>
      </div>
      <p className="admin-hint">
        <AppIcon name="sparkles" size={15} />{' '}
        {t('Món bị ẩn sẽ không xuất hiện trong kho món của người dùng sau lần tải trang kế tiếp.')}
      </p>
      {mutation.isError ? <Notice tone="danger">{errorMessage(mutation.error, t)}</Notice> : null}

      {recipes.isLoading ? (
        <LoadingBlock label={t('Đang tải danh sách món…')} />
      ) : recipes.isError ? (
        <Notice tone="danger">{errorMessage(recipes.error, t)}</Notice>
      ) : !recipes.data?.data.length ? (
        <EmptyState icon="book" title={t('Không tìm thấy món phù hợp')} />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('Món ăn')}</th>
                <th>{t('Phân loại')}</th>
                <th>{t('Thời gian')}</th>
                <th>{t('Tương tác')}</th>
                <th>{t('Trạng thái')}</th>
                <th>{t('Cập nhật')}</th>
                <th>
                  <span className="visually-hidden">{t('Thao tác')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recipes.data.data.map((recipe) => (
                <tr key={recipe.id}>
                  <td>
                    <div className="cell-recipe">
                      <img alt="" loading="lazy" src={recipe.image_path} />
                      <div>
                        <button
                          className="cell-recipe__name"
                          onClick={() => setInspecting(recipe.slug)}
                          type="button"
                        >
                          {recipe.name}
                        </button>
                        <small>{recipe.catalog_id ?? recipe.slug}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <small>
                      {t(recipe.region)} · {t(recipe.category)}
                    </small>
                    <small>{t(recipe.difficulty)}</small>
                  </td>
                  <td>
                    {t('{minutes} phút', { minutes: recipe.prep_minutes + recipe.cook_minutes })}
                  </td>
                  <td>
                    <small className="cell-stats">
                      <span title={t('Lượt yêu thích')}>
                        <AppIcon name="heart" size={13} /> {recipe.favorites}
                      </span>
                      <span title={t('Lượt lên kế hoạch')}>
                        <AppIcon name="calendar" size={13} /> {recipe.planned}
                      </span>
                      <span title={t('Lượt đã nấu')}>
                        <AppIcon name="check" size={13} /> {recipe.cooked}
                      </span>
                    </small>
                  </td>
                  <td>
                    <StatusBadge tone={recipe.status === 'published' ? 'success' : 'neutral'}>
                      {t(statusLabels[recipe.status])}
                    </StatusBadge>
                  </td>
                  <td>{formatDate(recipe.updated_at, { dateStyle: 'medium' })}</td>
                  <td>
                    <div className="cell-actions">
                      <button
                        className="text-button"
                        onClick={() => setInspecting(recipe.slug)}
                        type="button"
                      >
                        {t('Chi tiết')}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setEditing(recipe)}
                        type="button"
                      >
                        {t('Sửa')}
                      </button>
                      <button
                        className="text-button"
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({
                            slug: recipe.slug,
                            payload: {
                              ...toUpdate(recipe),
                              status: recipe.status === 'published' ? 'hidden' : 'published',
                            },
                          })
                        }
                        type="button"
                      >
                        {recipe.status === 'published' ? t('Ẩn') : t('Hiển thị')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        labels={{
          next: t('Trang sau'),
          previous: t('Trang trước'),
          summary: t('{from}–{to} trong {total}', {
            from: offset + 1,
            to: Math.min(offset + LIMIT, recipes.data?.total ?? 0),
            total: recipes.data?.total ?? 0,
          }),
        }}
        limit={LIMIT}
        offset={offset}
        onChange={(next) => setFilter('offset', next)}
        total={recipes.data?.total ?? 0}
      />

      {inspecting ? (
        <RecipeInsightsDrawer
          onClose={() => setInspecting(null)}
          onEdit={(recipe) => {
            setInspecting(null);
            setEditing(recipe);
          }}
          slug={inspecting}
        />
      ) : null}

      {editing ? (
        <RecipeEditor
          isSaving={mutation.isPending}
          onClose={() => setEditing(null)}
          onSave={(payload) => mutation.mutate({ slug: editing.slug, payload })}
          recipe={editing}
        />
      ) : null}
    </section>
  );
}

interface RecipeEditorProps {
  recipe: AdminRecipe;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: AdminRecipeUpdate) => void;
}

function RecipeEditor({ isSaving, onClose, onSave, recipe }: RecipeEditorProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<AdminRecipeUpdate>(() => toUpdate(recipe));
  const update = <K extends keyof AdminRecipeUpdate>(key: K, value: AdminRecipeUpdate[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        aria-labelledby="recipe-editor-title"
        aria-modal="true"
        className="modal ws-form"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        onSubmit={submit}
        role="dialog"
      >
        <header className="modal__head">
          <div>
            <span className="section-label">{t('Chỉnh sửa món ăn')}</span>
            <h2 id="recipe-editor-title">{recipe.name}</h2>
          </div>
          <button aria-label={t('Đóng')} className="icon-button" onClick={onClose} type="button">
            <AppIcon name="close" size={18} />
          </button>
        </header>
        <div className="modal__body">
          <label className="ws-field">
            <span>{t('Tên món')}</span>
            <input
              autoFocus
              maxLength={180}
              minLength={2}
              onChange={(event) => update('name', event.target.value)}
              required
              value={form.name}
            />
          </label>
          <label className="ws-field">
            <span>{t('Mô tả ngắn')}</span>
            <textarea
              maxLength={2000}
              onChange={(event) => update('excerpt', event.target.value)}
              required
              rows={3}
              value={form.excerpt}
            />
          </label>
          <div className="ws-grid-3">
            <label className="ws-field">
              <span>{t('Vùng miền')}</span>
              <select
                onChange={(event) => update('region', event.target.value)}
                value={form.region}
              >
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {t(region)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ws-field">
              <span>{t('Loại món')}</span>
              <select
                onChange={(event) => update('category', event.target.value)}
                value={form.category}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {t(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ws-field">
              <span>{t('Độ khó')}</span>
              <select
                onChange={(event) => update('difficulty', event.target.value)}
                value={form.difficulty}
              >
                {difficulties.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {t(difficulty)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="ws-grid-3">
            <label className="ws-field">
              <span>{t('Sơ chế (phút)')}</span>
              <input
                max={1440}
                min={0}
                onChange={(event) => update('prep_minutes', Number(event.target.value) || 0)}
                type="number"
                value={form.prep_minutes}
              />
            </label>
            <label className="ws-field">
              <span>{t('Nấu (phút)')}</span>
              <input
                max={1440}
                min={0}
                onChange={(event) => update('cook_minutes', Number(event.target.value) || 0)}
                type="number"
                value={form.cook_minutes}
              />
            </label>
            <label className="ws-field">
              <span>{t('Khẩu phần gốc')}</span>
              <input
                max={30}
                min={1}
                onChange={(event) =>
                  update('base_servings', Math.max(1, Number(event.target.value) || 1))
                }
                type="number"
                value={form.base_servings}
              />
            </label>
          </div>
          <label className="ws-field">
            <span>{t('Mách nhỏ')}</span>
            <textarea
              maxLength={2000}
              onChange={(event) => update('tip', event.target.value)}
              rows={2}
              value={form.tip}
            />
          </label>
          <label className="ws-field">
            <span>{t('Cách dùng')}</span>
            <textarea
              maxLength={2000}
              onChange={(event) => update('serving', event.target.value)}
              rows={2}
              value={form.serving}
            />
          </label>
          <label className="ws-field">
            <span>{t('Trạng thái')}</span>
            <select
              onChange={(event) => update('status', event.target.value as AdminRecipe['status'])}
              value={form.status}
            >
              {(Object.keys(statusLabels) as AdminRecipe['status'][]).map((status) => (
                <option key={status} value={status}>
                  {t(statusLabels[status])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="modal__foot">
          <button className="text-button" onClick={onClose} type="button">
            {t('Hủy')}
          </button>
          <Button isLoading={isSaving} type="submit">
            {t('Lưu thay đổi')}
          </Button>
        </footer>
      </form>
    </div>
  );
}

interface RecipeInsightsDrawerProps {
  slug: string;
  onClose: () => void;
  onEdit: (recipe: AdminRecipe) => void;
}

function RecipeInsightsDrawer({ onClose, onEdit, slug }: RecipeInsightsDrawerProps) {
  const { formatDate, formatNumber, t } = useI18n();
  const insights = useQuery({
    queryKey: adminKeys.recipeInsights(slug),
    queryFn: ({ signal }) => getAdminRecipeInsights(slug, signal),
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const recipe = insights.data?.recipe;
  const people = (items: AdminRecipeFan[], empty: string, kind: 'favorite' | 'cook') =>
    items.length ? (
      <ul className="people-list people-list--links">
        {items.map((person) => (
          <li key={person.user_id}>
            <Link to={`/admin/users/${person.user_id}`}>
              <UserAvatar name={person.full_name} size={34} src={person.avatar_url} />
              <div>
                <strong>{person.full_name}</strong>
                <small>{person.email ?? '—'}</small>
              </div>
              <time dateTime={person.occurred_at}>
                {kind === 'cook'
                  ? t('{count} lần', { count: person.times ?? 0 })
                  : formatDate(person.occurred_at, { dateStyle: 'medium' })}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">{empty}</p>
    );

  return (
    <div
      className="drawer-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="recipe-insights-title"
        aria-modal="true"
        className="drawer"
        role="dialog"
      >
        <header className="drawer__head">
          <span className="section-label">{t('Chi tiết món ăn')}</span>
          <button
            aria-label={t('Đóng')}
            autoFocus
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <AppIcon name="close" size={18} />
          </button>
        </header>
        {insights.isLoading ? (
          <LoadingBlock label={t('Đang tải số liệu món…')} />
        ) : insights.isError || !insights.data || !recipe ? (
          <Notice tone="danger">{errorMessage(insights.error, t)}</Notice>
        ) : (
          <div className="drawer__body">
            <div className="drawer__cover">
              <img alt="" src={recipe.image_path} />
              <StatusBadge tone={recipe.status === 'published' ? 'success' : 'neutral'}>
                {t(statusLabels[recipe.status])}
              </StatusBadge>
            </div>
            <div>
              <h2 id="recipe-insights-title">{recipe.name}</h2>
              <p className="muted">
                {recipe.catalog_id ?? recipe.slug} · {t(recipe.region)} · {t(recipe.category)} ·{' '}
                {t(recipe.difficulty)}
              </p>
              <p className="drawer__excerpt">{recipe.excerpt}</p>
            </div>
            <div className="mini-stats">
              {[
                { icon: 'heart' as const, label: 'Yêu thích', value: recipe.favorites },
                { icon: 'calendar' as const, label: 'Lên kế hoạch', value: recipe.planned },
                { icon: 'check' as const, label: 'Đã nấu', value: recipe.cooked },
                { icon: 'clock' as const, label: 'Sắp tới', value: insights.data.upcoming },
              ].map((stat) => (
                <div key={stat.label}>
                  <AppIcon name={stat.icon} size={16} />
                  <strong>{formatNumber(stat.value)}</strong>
                  <small>{t(stat.label)}</small>
                </div>
              ))}
            </div>
            {recipe.planned ? (
              <p className="admin-hint">
                <AppIcon name="sparkles" size={15} />
                {t('Tỉ lệ nấu thành công {rate}% · {skipped} lần bị bỏ qua', {
                  rate: Math.round((recipe.cooked / recipe.planned) * 100),
                  skipped: insights.data.skipped,
                })}
              </p>
            ) : null}
            <section>
              <h3>{t('Yêu thích gần đây')}</h3>
              {people(insights.data.recent_favorites, t('Chưa có ai lưu món này.'), 'favorite')}
            </section>
            <section>
              <h3>{t('Nấu nhiều nhất')}</h3>
              {people(insights.data.top_cooks, t('Chưa có ai nấu món này.'), 'cook')}
            </section>
          </div>
        )}
        <footer className="drawer__foot">
          <Link className="button button--secondary" target="_blank" to={`/recipes/${slug}`}>
            <AppIcon name="external" size={16} />
            <span>{t('Xem trang món')}</span>
          </Link>
          <Button disabled={!recipe} onClick={() => recipe && onEdit(recipe)}>
            <AppIcon name="pen" size={16} /> {t('Chỉnh sửa')}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  Panel,
  StatusBadge,
} from '@/components/ui/Workspace';
import {
  adminKeys,
  getAdminUserPlans,
  listAdminPlanners,
  type AdminPlanItem,
} from '@/features/admin/adminApi';
import { mealLabels, planStatusLabels, planStatusTone } from '@/features/admin/labels';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import { useI18n } from '@/features/i18n/I18nContext';
import { dishImage } from '@/data/dishImages';
import { errorMessage } from '@/lib/errors';

const LIMIT = 12;
export function AdminPlansPage() {
  const { formatDate, t } = useI18n();
  const { offset, setFilter, values } = useAdminFilters(['q', 'user'] as const);
  const [search, setSearch] = useState(values.q);
  const params = { q: values.q, limit: LIMIT, offset };
  const planners = useQuery({
    queryKey: adminKeys.list('plans', params),
    queryFn: ({ signal }) => listAdminPlanners(params, signal),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: adminKeys.userPlans(values.user),
    queryFn: ({ signal }) => getAdminUserPlans(values.user, signal),
    enabled: Boolean(values.user),
  });
  const grouped = useMemo(() => {
    const groups = new Map<string, AdminPlanItem[]>();
    for (const item of detail.data?.data ?? []) {
      groups.set(item.plan_date, [...(groups.get(item.plan_date) ?? []), item]);
    }
    return [...groups.entries()];
  }, [detail.data]);

  return (
    <section className="admin-section admin-plans">
      <div className="admin-plans__list">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilter('q', search.trim());
          }}
        >
          <SearchField
            actionLabel={t('Tìm')}
            label={t('Tìm người dùng')}
            onChange={setSearch}
            placeholder={t('Tên hoặc email…')}
            value={search}
          />
        </form>
        {planners.isLoading ? (
          <LoadingBlock label={t('Đang tải kế hoạch…')} />
        ) : planners.isError ? (
          <Notice tone="danger">{errorMessage(planners.error, t)}</Notice>
        ) : !planners.data?.data.length ? (
          <EmptyState icon="calendar" title={t('Chưa có người dùng nào lên kế hoạch')} />
        ) : (
          <ul className="planner-people">
            {planners.data.data.map((row) => (
              <li key={row.user_id}>
                <button
                  aria-pressed={values.user === row.user_id}
                  className={values.user === row.user_id ? 'is-active' : ''}
                  onClick={() => setFilter('user', row.user_id)}
                  type="button"
                >
                  <UserAvatar name={row.full_name} size={38} src={row.avatar_url} />
                  <span>
                    <strong>{row.full_name}</strong>
                    <small>{row.email ?? '—'}</small>
                    <small>
                      {t('{total} món · {upcoming} sắp tới · {completed} đã nấu', {
                        total: row.total_items,
                        upcoming: row.upcoming_items,
                        completed: row.completed_items,
                      })}
                    </small>
                  </span>
                  <AppIcon name="arrow" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          labels={{
            next: t('Trang sau'),
            previous: t('Trang trước'),
            summary: t('{from}–{to} trong {total}', {
              from: offset + 1,
              to: Math.min(offset + LIMIT, planners.data?.total ?? 0),
              total: planners.data?.total ?? 0,
            }),
          }}
          limit={LIMIT}
          offset={offset}
          onChange={(next) => setFilter('offset', next)}
          total={planners.data?.total ?? 0}
        />
      </div>

      <div className="admin-plans__detail">
        {!values.user ? (
          <EmptyState
            description={t(
              'Chọn một người dùng ở danh sách bên trái để xem toàn bộ kế hoạch bữa ăn.',
            )}
            icon="calendar"
            title={t('Kế hoạch từng người dùng')}
          />
        ) : detail.isLoading ? (
          <LoadingBlock label={t('Đang tải kế hoạch…')} />
        ) : detail.isError || !detail.data ? (
          <Notice tone="danger">{errorMessage(detail.error, t)}</Notice>
        ) : (
          <Panel
            actions={
              <Link className="text-link" to={`/admin/users/${values.user}`}>
                {t('Hồ sơ đầy đủ')} <AppIcon name="arrow" size={15} />
              </Link>
            }
            description={t('{count} món trong kế hoạch (hiển thị tối đa 200 mục gần nhất).', {
              count: detail.data.total,
            })}
            icon="calendar"
            title={t('Kế hoạch của {name}', { name: detail.data.user.full_name })}
          >
            {grouped.length === 0 ? (
              <p className="muted">{t('Người dùng này chưa có món nào trong kế hoạch.')}</p>
            ) : (
              <ol className="plan-timeline">
                {grouped.map(([date, items]) => (
                  <li key={date}>
                    <time dateTime={date}>
                      {formatDate(date, {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </time>
                    <ul>
                      {items.map((item) => (
                        <li key={item.id}>
                          <img alt="" {...dishImage(item.recipe_slug, item.image_path)} />
                          <div>
                            <Link target="_blank" to={`/recipes/${item.recipe_slug}`}>
                              {item.recipe_name}
                            </Link>
                            <small>
                              {t(mealLabels[item.meal_type])} ·{' '}
                              {t('{count} khẩu phần', { count: item.servings })}
                            </small>
                          </div>
                          <StatusBadge tone={planStatusTone[item.completion_status]}>
                            {t(planStatusLabels[item.completion_status])}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}
      </div>
    </section>
  );
}

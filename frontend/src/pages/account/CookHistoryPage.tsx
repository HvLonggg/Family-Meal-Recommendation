import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { EmptyState, LoadingBlock, Notice, Pagination } from '@/components/ui/Workspace';
import { dishImage } from '@/data/dishImages';
import { recipeText } from '@/data/recipes';
import { useAuth } from '@/features/auth/AuthContext';
import {
  cookLogsQueryKey,
  deleteCookLog,
  getCookLogs,
  type CookLog,
  type CookSource,
} from '@/features/cooking/cookingApi';
import { cookPath } from '@/features/cooking/cookSession';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const PAGE_SIZE = 20;

const sourceLabels: Record<CookSource, string> = {
  cook_mode: 'Nấu cùng Chú Rồng',
  planner: 'Theo kế hoạch',
  manual: 'Tự đánh dấu',
};

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function CookHistoryPage() {
  const { user } = useAuth();
  const { formatDate, formatNumber, t } = useI18n();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const logs = useQuery({
    queryKey: [...cookLogsQueryKey(user?.id), offset],
    queryFn: ({ signal }) => getCookLogs(PAGE_SIZE, offset, signal),
    enabled: Boolean(user),
  });
  const removal = useMutation({
    mutationFn: (id: string) => deleteCookLog(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cook-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-items'] });
      void queryClient.invalidateQueries({ queryKey: ['planner-meal-history'] });
    },
  });

  const groups: { key: string; label: string; items: CookLog[] }[] = [];
  for (const log of logs.data?.data ?? []) {
    const key = dayKey(log.cooked_at);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(log);
    else {
      groups.push({
        key,
        label: formatDate(log.cooked_at, { weekday: 'long', day: 'numeric', month: 'long' }),
        items: [log],
      });
    }
  }
  const stats = logs.data?.stats;

  return (
    <>
      <header className="ws-heading ws-heading--with-action">
        <div>
          <span className="section-label">{t('Nhật ký bếp')}</span>
          <h1>{t('Món đã nấu')}</h1>
          <p>
            {t(
              'Mỗi lần bạn đánh dấu đã nấu, tick trong kế hoạch hoặc nấu xong cùng Chú Rồng đều được ghi lại ở đây.',
            )}
          </p>
        </div>
        <Link className="button button--primary" to="/recipes">
          <AppIcon name="chef" size={17} /> {t('Chọn món để nấu')}
        </Link>
      </header>

      {stats ? (
        <dl className="cook-stats">
          <div>
            <dt>{t('Lần nấu')}</dt>
            <dd>{formatNumber(stats.total)}</dd>
          </div>
          <div>
            <dt>{t('Món khác nhau')}</dt>
            <dd>{formatNumber(stats.dishes)}</dd>
          </div>
          <div>
            <dt>{t('7 ngày qua')}</dt>
            <dd>{formatNumber(stats.last_7_days)}</dd>
          </div>
          <div>
            <dt>{t('Phút đứng bếp')}</dt>
            <dd>{formatNumber(stats.total_minutes)}</dd>
          </div>
        </dl>
      ) : null}

      {removal.isError ? <Notice tone="danger">{errorMessage(removal.error, t)}</Notice> : null}

      {logs.isLoading ? (
        <LoadingBlock label={t('Đang tải lịch sử nấu…')} />
      ) : logs.isError ? (
        <Notice tone="danger">{errorMessage(logs.error, t)}</Notice>
      ) : groups.length ? (
        <>
          {groups.map((group) => (
            <section className="cook-history" key={group.key}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map((log) => (
                  <li className="cook-history__item" key={log.id}>
                    <img alt="" {...dishImage(log.recipe_slug, log.image_path)} />
                    <div className="cook-history__body">
                      <Link to={`/recipes/${log.recipe_slug}`}>
                        <strong>{recipeText(log.recipe_name)}</strong>
                      </Link>
                      <small>
                        {formatDate(log.cooked_at, { hour: '2-digit', minute: '2-digit' })} ·{' '}
                        {t('{count} người', { count: log.servings })}
                        {log.duration_seconds
                          ? ` · ${t('{minutes} phút', {
                              minutes: Math.max(1, Math.round(log.duration_seconds / 60)),
                            })}`
                          : ''}
                      </small>
                      <span className={`cook-source cook-source--${log.source}`}>
                        {t(sourceLabels[log.source])}
                      </span>
                      {log.note ? <p>{log.note}</p> : null}
                    </div>
                    <div className="cook-history__actions">
                      <Link
                        aria-label={t('Nấu lại {name}', { name: recipeText(log.recipe_name) })}
                        className="button button--outline"
                        to={cookPath([{ slug: log.recipe_slug, servings: log.servings }])}
                      >
                        <AppIcon name="chef" size={16} />
                        <span>{t('Nấu lại')}</span>
                      </Link>
                      <button
                        aria-label={t('Xóa lần nấu {name}', { name: recipeText(log.recipe_name) })}
                        className="button button--outline"
                        disabled={removal.isPending}
                        onClick={() => removal.mutate(log.id)}
                        type="button"
                      >
                        <AppIcon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <Pagination
            labels={{
              previous: t('Trước'),
              next: t('Sau'),
              summary: t('{from}–{to} trên {total} lần nấu', {
                from: offset + 1,
                to: Math.min(offset + PAGE_SIZE, logs.data?.total ?? 0),
                total: logs.data?.total ?? 0,
              }),
            }}
            limit={PAGE_SIZE}
            offset={offset}
            onChange={setOffset}
            total={logs.data?.total ?? 0}
          />
        </>
      ) : (
        <EmptyState
          action={
            <Link className="button button--primary" to="/recipes">
              {t('Tìm món để nấu')}
            </Link>
          }
          description={t(
            'Vào bếp cùng Chú Rồng hoặc bấm "Đánh dấu đã nấu" ở trang món để bắt đầu nhật ký.',
          )}
          icon="history"
          title={t('Chưa có món nào được ghi nhận')}
        />
      )}
    </>
  );
}

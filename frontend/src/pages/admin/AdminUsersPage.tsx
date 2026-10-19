import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { UserCreator } from '@/components/admin/UserCreator';
import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/common/SearchField';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  StatusBadge,
} from '@/components/ui/Workspace';
import { adminKeys, createAdminUser, listAdminUsers } from '@/features/admin/adminApi';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import { useUserAccessActions } from '@/features/admin/useUserAccessActions';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const LIMIT = 15;

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { formatDate, t } = useI18n();
  const navigate = useNavigate();
  const { offset, setFilter, values } = useAdminFilters(['q', 'role', 'status'] as const);
  const [search, setSearch] = useState(values.q);
  const params = { ...values, limit: LIMIT, offset };
  const users = useQuery({
    queryKey: adminKeys.list('users', params),
    queryFn: ({ signal }) => listAdminUsers(params, signal),
    placeholderData: keepPreviousData,
  });
  const { closeConfirm, confirm, mutation, toggleRole, toggleStatus } = useUserAccessActions();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: createAdminUser,
    onSuccess: async (row) => {
      setCreating(false);
      setCreated(row.full_name);
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
            label={t('Tìm người dùng')}
            onChange={setSearch}
            placeholder={t('Tên hoặc email…')}
            value={search}
          />
        </form>
        <select
          aria-label={t('Vai trò')}
          onChange={(event) => setFilter('role', event.target.value)}
          value={values.role}
        >
          <option value="">{t('Mọi vai trò')}</option>
          <option value="user">{t('Thành viên')}</option>
          <option value="admin">{t('Quản trị viên')}</option>
        </select>
        <select
          aria-label={t('Trạng thái')}
          onChange={(event) => setFilter('status', event.target.value)}
          value={values.status}
        >
          <option value="">{t('Mọi trạng thái')}</option>
          <option value="active">{t('Đang hoạt động')}</option>
          <option value="locked">{t('Đã khóa')}</option>
        </select>
        <Button
          className="admin-filters__create"
          onClick={() => {
            create.reset();
            setCreating(true);
          }}
        >
          <AppIcon name="plus" size={16} /> {t('Thêm người dùng')}
        </Button>
      </div>

      {created ? (
        <Notice tone="success">{t('Đã tạo tài khoản cho {name}.', { name: created })}</Notice>
      ) : null}

      {mutation.isError ? <Notice tone="danger">{errorMessage(mutation.error, t)}</Notice> : null}

      {users.isLoading ? (
        <LoadingBlock label={t('Đang tải người dùng…')} />
      ) : users.isError ? (
        <Notice tone="danger">{errorMessage(users.error, t)}</Notice>
      ) : !users.data?.data.length ? (
        <EmptyState icon="users" title={t('Không có người dùng phù hợp')} />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('Người dùng')}</th>
                <th>{t('Vai trò')}</th>
                <th>{t('Trạng thái')}</th>
                <th>{t('Hoạt động')}</th>
                <th>{t('Tham gia')}</th>
                <th>
                  <span className="visually-hidden">{t('Thao tác')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.data.map((row) => {
                const isSelf = row.id === currentUser?.id;
                return (
                  <tr
                    className="is-clickable"
                    key={row.id}
                    onClick={(event) => {
                      // Bấm vào nút/link trong dòng giữ hành vi riêng của nó.
                      if ((event.target as HTMLElement).closest('a, button')) return;
                      void navigate(`/admin/users/${row.id}`);
                    }}
                  >
                    <td>
                      <div className="cell-person">
                        <UserAvatar name={row.full_name} size={36} src={row.avatar_url} />
                        <div>
                          <Link className="cell-person__name" to={`/admin/users/${row.id}`}>
                            {row.full_name} {isSelf ? <em>({t('bạn')})</em> : null}
                          </Link>
                          <small>{row.email ?? '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge tone={row.role === 'admin' ? 'info' : 'neutral'}>
                        {row.role === 'admin' ? t('Quản trị viên') : t('Thành viên')}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={row.status === 'active' ? 'success' : 'danger'}>
                        {row.status === 'active' ? t('Đang hoạt động') : t('Đã khóa')}
                      </StatusBadge>
                    </td>
                    <td>
                      <small className="cell-stats">
                        <span title={t('Món yêu thích')}>
                          <AppIcon name="heart" size={13} /> {row.favorites}
                        </span>
                        <span title={t('Món trong kế hoạch')}>
                          <AppIcon name="calendar" size={13} /> {row.plan_items}
                        </span>
                        <span title={t('Bài viết')}>
                          <AppIcon name="pen" size={13} /> {row.stories}
                        </span>
                      </small>
                      <small>
                        {t('Đăng nhập')}:{' '}
                        {row.last_login_at
                          ? formatDate(row.last_login_at, { dateStyle: 'short' })
                          : '—'}
                      </small>
                    </td>
                    <td>{formatDate(row.created_at, { dateStyle: 'medium' })}</td>
                    <td>
                      <div className="cell-actions">
                        <Link className="text-button" to={`/admin/users/${row.id}`}>
                          {t('Chi tiết')}
                        </Link>
                        <button
                          className="text-button"
                          disabled={isSelf || mutation.isPending}
                          onClick={() => toggleRole(row)}
                          type="button"
                        >
                          {row.role === 'admin' ? t('Bỏ quyền QT') : t('Cấp quyền QT')}
                        </button>
                        <button
                          className={`text-button${row.status === 'active' ? ' text-button--danger' : ''}`}
                          disabled={isSelf || mutation.isPending}
                          onClick={() => toggleStatus(row)}
                          type="button"
                        >
                          {row.status === 'active' ? t('Khóa') : t('Mở khóa')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            to: Math.min(offset + LIMIT, users.data?.total ?? 0),
            total: users.data?.total ?? 0,
          }),
        }}
        limit={LIMIT}
        offset={offset}
        onChange={(next) => setFilter('offset', next)}
        total={users.data?.total ?? 0}
      />
      <ConfirmDialog isPending={mutation.isPending} onClose={closeConfirm} request={confirm} />
      {creating ? (
        <UserCreator
          error={create.isError ? errorMessage(create.error, t) : null}
          isSaving={create.isPending}
          onClose={() => setCreating(false)}
          onSave={(payload) => create.mutate(payload)}
        />
      ) : null}
    </section>
  );
}

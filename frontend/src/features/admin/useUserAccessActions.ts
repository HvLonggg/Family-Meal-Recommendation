import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ConfirmRequest } from '@/components/admin/ConfirmDialog';
import { adminKeys, updateAdminUser, type AdminUserRow } from '@/features/admin/adminApi';
import { useI18n } from '@/features/i18n/I18nContext';

/** Đổi vai trò/khóa tài khoản kèm hộp thoại xác nhận; dùng chung cho danh sách và trang chi tiết. */
export function useUserAccessActions() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateAdminUser>[1] }) =>
      updateAdminUser(id, payload),
    onSettled: () => setConfirm(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });

  const toggleRole = (row: AdminUserRow) => {
    const role = row.role === 'admin' ? 'user' : 'admin';
    setConfirm({
      title:
        role === 'admin'
          ? t('Cấp quyền quản trị cho {name}?', { name: row.full_name })
          : t('Thu hồi quyền quản trị của {name}?', { name: row.full_name }),
      description: t('Người dùng sẽ cần đăng nhập lại để quyền mới có hiệu lực.'),
      confirmLabel: role === 'admin' ? t('Cấp quyền QT') : t('Bỏ quyền QT'),
      tone: role === 'admin' ? 'primary' : 'danger',
      onConfirm: () => mutation.mutate({ id: row.id, payload: { role } }),
    });
  };

  const toggleStatus = (row: AdminUserRow) => {
    const status = row.status === 'active' ? 'locked' : 'active';
    setConfirm({
      title:
        status === 'locked'
          ? t('Khóa tài khoản {name}?', { name: row.full_name })
          : t('Mở khóa tài khoản {name}?', { name: row.full_name }),
      description:
        status === 'locked'
          ? t(
              'Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập cho tới khi được mở khóa.',
            )
          : t('Người dùng có thể đăng nhập và sử dụng lại toàn bộ tính năng.'),
      confirmLabel: status === 'locked' ? t('Khóa') : t('Mở khóa'),
      tone: status === 'locked' ? 'danger' : 'primary',
      onConfirm: () => mutation.mutate({ id: row.id, payload: { status } }),
    });
  };

  return {
    confirm,
    closeConfirm: () => setConfirm(null),
    mutation,
    toggleRole,
    toggleStatus,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/Button';
import { Notice, Panel } from '@/components/ui/Workspace';
import {
  accountOverviewQueryKey,
  getAccountOverview,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from '@/features/account/accountApi';
import { DEFAULT_PREFERENCES } from '@/features/account/preferences';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';
import { resizeImageFile } from '@/lib/image';

export function AccountOverviewPage() {
  const { updateUser, user } = useAuth();
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const overview = useQuery({
    queryKey: accountOverviewQueryKey(user?.id),
    queryFn: ({ signal }) => getAccountOverview(signal),
    enabled: Boolean(user),
  });

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (nextUser) => {
      updateUser(nextUser);
      setNotice({ tone: 'success', text: t('Đã cập nhật họ tên.') });
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error, t) }),
  });
  const avatarMutation = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return removeAvatar();
      const dataUrl = await resizeImageFile(file, {
        maxSize: 320,
        maxBytes: 380 * 1024,
        square: true,
      });
      return uploadAvatar(dataUrl);
    },
    onSuccess: (nextUser, file) => {
      updateUser(nextUser);
      void queryClient.invalidateQueries({ queryKey: accountOverviewQueryKey(user?.id) });
      setNotice({
        tone: 'success',
        text: file ? t('Ảnh đại diện mới đã được lưu.') : t('Đã gỡ ảnh đại diện.'),
      });
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error, t) }),
  });

  if (!user) return null;
  const preferences = user.preferences ?? DEFAULT_PREFERENCES;
  const stats = overview.data?.stats;
  const statCards: { icon: IconName; label: string; value: number | undefined; to: string }[] = [
    { icon: 'heart', label: 'Món yêu thích', value: stats?.favorites, to: '/favorites' },
    { icon: 'calendar', label: 'Món trong kế hoạch', value: stats?.planned_meals, to: '/planner' },
    { icon: 'check', label: 'Bữa đã nấu', value: stats?.cooked_meals, to: '/planner' },
    {
      icon: 'pen',
      label: 'Câu chuyện đã đăng',
      value: stats?.published_stories,
      to: '/account/stories',
    },
    {
      icon: 'chef',
      label: 'Món đã đề xuất',
      value: stats?.submissions,
      to: '/account/submissions',
    },
  ];

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    profileMutation.mutate(fullName);
  };

  const pickAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice(null);
    avatarMutation.mutate(file);
  };

  return (
    <>
      <header className="ws-heading">
        <span className="section-label">{t('Không gian cá nhân')}</span>
        <h1>
          {t('Chào {name}, hôm nay mình nấu gì?', { name: user.full_name.split(' ').at(-1) ?? '' })}
        </h1>
        <p>{t('Quản lý hồ sơ, gia đình và mọi thứ bạn đã lưu trên Bếp Việt.')}</p>
      </header>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Panel
        description={t('Ảnh đại diện và họ tên hiển thị trên câu chuyện bạn chia sẻ.')}
        icon="user"
        id="profile"
        title={t('Hồ sơ của bạn')}
      >
        <div className="profile-editor">
          <div className="profile-editor__avatar">
            <UserAvatar name={user.full_name} size={112} src={user.avatar_url} />
            <input
              accept="image/jpeg,image/png,image/webp"
              aria-label={t('Chọn ảnh đại diện')}
              className="visually-hidden"
              onChange={pickAvatar}
              ref={fileInputRef}
              type="file"
            />
            <div className="profile-editor__avatar-actions">
              <Button
                isLoading={avatarMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
              >
                <AppIcon name="camera" size={16} /> {t('Đổi ảnh')}
              </Button>
              {user.avatar_url ? (
                <button
                  className="text-button text-button--danger"
                  disabled={avatarMutation.isPending}
                  onClick={() => avatarMutation.mutate(null)}
                  type="button"
                >
                  {t('Gỡ ảnh')}
                </button>
              ) : null}
            </div>
            <small>{t('JPG, PNG hoặc WebP. Ảnh được cắt vuông và nén tự động.')}</small>
          </div>
          <form className="ws-form profile-editor__form" onSubmit={submitName}>
            <label className="ws-field">
              <span>{t('Họ và tên')}</span>
              <input
                autoComplete="name"
                maxLength={120}
                minLength={2}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </label>
            <label className="ws-field">
              <span>{t('Email đăng nhập')}</span>
              <input disabled value={user.email ?? user.phone_e164 ?? ''} />
            </label>
            <dl className="profile-facts">
              <div>
                <dt>{t('Thành viên từ')}</dt>
                <dd>{formatDate(user.created_at, { dateStyle: 'long' })}</dd>
              </div>
              <div>
                <dt>{t('Đăng nhập gần nhất')}</dt>
                <dd>
                  {overview.data?.last_login_at
                    ? formatDate(overview.data.last_login_at, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—'}
                </dd>
              </div>
            </dl>
            <div className="ws-form__actions">
              <Button
                disabled={fullName.trim() === user.full_name}
                isLoading={profileMutation.isPending}
                type="submit"
              >
                {t('Lưu hồ sơ')}
              </Button>
            </div>
          </form>
        </div>
      </Panel>

      <div className="ws-stat-grid" aria-busy={overview.isLoading}>
        {statCards.map((card) => (
          <Link className="ws-stat" key={card.label} to={card.to}>
            <span className="ws-stat__icon">
              <AppIcon name={card.icon} size={19} />
            </span>
            <strong>{card.value ?? '–'}</strong>
            <small>{t(card.label)}</small>
          </Link>
        ))}
      </div>

      <div className="ws-split">
        <Panel
          actions={
            <Link className="text-link" to="/account/settings#household">
              {t('Chỉnh sửa')} <AppIcon name="arrow" size={15} />
            </Link>
          }
          icon="users"
          title={t('Gia đình & khẩu phần')}
        >
          <div className="household-summary">
            <strong>
              {t('{count} suất ăn mỗi bữa', { count: preferences.computed_servings })}
            </strong>
            <p>
              {preferences.household_description ||
                (preferences.household_members.length
                  ? preferences.household_members
                      .map((member) => `${member.label} (${t('{age} tuổi', { age: member.age })})`)
                      .join(' · ')
                  : t('Bạn chưa khai báo thành viên. Bếp Việt đang dùng khẩu phần mặc định.'))}
            </p>
          </div>
        </Panel>
        <Panel icon="sparkles" title={t('Lối tắt')}>
          <div className="quick-actions">
            <Link to="/planner">
              <AppIcon name="calendar" size={18} /> {t('Lên kế hoạch tuần')}
            </Link>
            <Link to="/stories/new">
              <AppIcon name="pen" size={18} /> {t('Viết câu chuyện bếp')}
            </Link>
            <Link to="/submit-recipe">
              <AppIcon name="plus" size={18} /> {t('Đề xuất món mới')}
            </Link>
            <Link to="/account/settings">
              <AppIcon name="settings" size={18} /> {t('Cài đặt ứng dụng')}
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

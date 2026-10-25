import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { Notice, Panel, Toggle } from '@/components/ui/Workspace';
import { exportAccountData, savePreferences } from '@/features/account/accountApi';
import { parseHouseholdDescription } from '@/features/account/householdParser';
import {
  DEFAULT_PREFERENCES,
  dietaryTagLabels,
  householdPortions,
  householdPresets,
  portionFactor,
  recommendedServings,
} from '@/features/account/preferences';
import { useAuth } from '@/features/auth/AuthContext';
import type {
  Appetite,
  DietaryTag,
  HouseholdMember,
  Language,
  PreferredRegion,
  UserPreferences,
} from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';
import { formatLunarLong } from '@/features/planner/plannerCalendar';
import { errorMessage } from '@/lib/errors';
import { lunarFromIsoDate, vietnamToday } from '@/lib/lunarCalendar';
import { MemoryPanel } from '@/pages/account/MemoryPanel';

const appetiteLabels: Record<Appetite, string> = {
  light: 'Ăn ít',
  normal: 'Bình thường',
  big: 'Ăn nhiều',
};
const regions: PreferredRegion[] = ['Bắc', 'Trung', 'Nam'];
const cookingTimes = [0, 20, 30, 45, 60, 90];

function comparable(preferences: UserPreferences) {
  return JSON.stringify({ ...preferences, computed_portions: 0, computed_servings: 0 });
}

type SettingsTab = 'general' | 'meals' | 'notify' | 'assistant' | 'admin';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: IconName; admin?: boolean }[] = [
  { id: 'general', label: 'Chung', icon: 'globe' },
  { id: 'meals', label: 'Bữa ăn', icon: 'plate', admin: false },
  { id: 'notify', label: 'Thông báo & riêng tư', icon: 'calendar', admin: false },
  { id: 'assistant', label: 'Chú Rồng', icon: 'sparkles' },
  { id: 'admin', label: 'Quản trị', icon: 'shield', admin: true },
];

const SECTION_TAB: Record<string, SettingsTab> = {
  language: 'general',
  household: 'meals',
  diet: 'meals',
  planner: 'notify',
  privacy: 'notify',
  'assistant-tone': 'assistant',
  memories: 'assistant',
  admin: 'admin',
};

export function SettingsPage() {
  const { updateUser, user } = useAuth();
  const { formatDate, formatNumber, language, setLanguage, t } = useI18n();
  const todayInVietnam = vietnamToday();
  const location = useLocation();
  const saved = user?.preferences ?? DEFAULT_PREFERENCES;
  const [draft, setDraft] = useState<UserPreferences>(saved);
  const [notice, setNotice] = useState<{
    tone: 'success' | 'danger' | 'info';
    text: string;
  } | null>(null);
  const isAdmin = user?.role === 'admin';
  const dirty = comparable(draft) !== comparable({ ...saved, language: draft.language });

  const [tab, setTab] = useState<SettingsTab>(
    () => SECTION_TAB[location.hash.slice(1)] ?? 'general',
  );

  // Liên kết tới một mục (ví dụ #memories từ khung chat) mở đúng tab rồi cuộn tới mục đó.
  const [seenHash, setSeenHash] = useState(location.hash);
  if (location.hash !== seenHash) {
    setSeenHash(location.hash);
    const target = SECTION_TAB[location.hash.slice(1)];
    if (target) setTab(target);
  }
  useEffect(() => {
    if (!location.hash) return;
    document.querySelector(location.hash)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [location.hash, tab]);

  const saveMutation = useMutation({
    mutationFn: (preferences: UserPreferences) => savePreferences(preferences),
    onSuccess: (preferences) => {
      if (user) updateUser({ ...user, preferences });
      setDraft(preferences);
      setNotice({ tone: 'success', text: t('Đã lưu cài đặt cho tài khoản của bạn.') });
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error, t) }),
  });
  const exportMutation = useMutation({
    mutationFn: exportAccountData,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bep-viet-du-lieu-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error, t) }),
  });

  const portions = useMemo(() => householdPortions(draft.household_members), [draft]);
  const servings = recommendedServings(draft);

  if (!user) return null;

  const update = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setNotice(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateMember = (index: number, patch: Partial<HouseholdMember>) =>
    update(
      'household_members',
      draft.household_members.map((member, position) =>
        position === index ? { ...member, ...patch } : member,
      ),
    );
  const toggleInList = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const chooseLanguage = (value: Language) => {
    setLanguage(value);
    setDraft((current) => ({ ...current, language: value }));
  };

  const applyDescription = () => {
    const members = parseHouseholdDescription(draft.household_description);
    if (!members.length) {
      setNotice({
        tone: 'info',
        text: t('Chưa nhận ra thành viên nào. Hãy thử: “2 bố mẹ và bạn nhỏ 12 tuổi”.'),
      });
      return;
    }
    update('household_members', members);
    setNotice({
      tone: 'info',
      text: t('Đã gợi ý {count} thành viên từ mô tả. Bạn kiểm tra lại rồi lưu nhé.', {
        count: members.length,
      }),
    });
  };

  return (
    <>
      <header className="ws-heading">
        <span className="section-label">{t('Cài đặt')}</span>
        <h1>{t('Cài đặt ứng dụng')}</h1>
        <p>
          {t(
            'Mọi thiết lập được lưu theo tài khoản và tự áp dụng trên mọi thiết bị bạn đăng nhập.',
          )}
        </p>
      </header>

      <div className="tab-pills settings-tabs" role="tablist" aria-label={t('Nhóm cài đặt')}>
        {SETTINGS_TABS.filter((item) =>
          item.admin === undefined ? true : item.admin === isAdmin,
        ).map((item) => (
          <button
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            <AppIcon name={item.icon} size={15} /> {t(item.label)}
          </button>
        ))}
      </div>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {tab === 'general' ? (
        <Panel
          description={t('Áp dụng cho toàn bộ giao diện ngay khi bạn chọn.')}
          icon="globe"
          id="language"
          title={t('Ngôn ngữ & hiển thị')}
        >
          <div className="choice-cards" role="radiogroup" aria-label={t('Ngôn ngữ')}>
            {(
              [
                { id: 'vi', title: 'Tiếng Việt', hint: 'Giao diện tiếng Việt' },
                { id: 'en', title: 'English', hint: 'English interface' },
              ] as const
            ).map((option) => (
              <button
                aria-checked={language === option.id}
                className={`choice-card${language === option.id ? ' is-active' : ''}`}
                key={option.id}
                lang={option.id}
                onClick={() => chooseLanguage(option.id)}
                role="radio"
                type="button"
              >
                <strong>{option.title}</strong>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
          <div className="ws-fieldset">
            <span className="ws-fieldset__label">{t('Cỡ chữ')}</span>
            <div className="segmented-control segmented-control--soft">
              {(['normal', 'large'] as const).map((size) => (
                <button
                  aria-pressed={draft.text_size === size}
                  className={draft.text_size === size ? 'is-active' : ''}
                  key={size}
                  onClick={() => update('text_size', size)}
                  type="button"
                >
                  {size === 'normal' ? t('Mặc định') : t('Lớn hơn')}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            checked={draft.reduce_motion}
            description={t('Tắt hiệu ứng chuyển động và vòng quay để giao diện tĩnh hơn.')}
            label={t('Giảm chuyển động')}
            onChange={(value) => update('reduce_motion', value)}
          />
        </Panel>
      ) : null}

      {/* Quản trị viên chỉ cần thiết lập hiển thị và quản trị; phần cá nhân hóa bữa ăn dành cho người dùng. */}
      {!isAdmin && tab === 'meals' ? (
        <>
          <Panel
            description={t(
              'Khai báo người ăn cùng để Bếp Việt tự tính khẩu phần và lượng nguyên liệu phù hợp.',
            )}
            icon="users"
            id="household"
            title={t('Gia đình & khẩu phần')}
          >
            <div className="household-presets">
              {householdPresets.map((preset) => (
                <button
                  className="preset-chip"
                  key={preset.id}
                  onClick={() => {
                    update('household_members', preset.members);
                    update('servings_mode', 'auto');
                  }}
                  type="button"
                >
                  <strong>{t(preset.label)}</strong>
                  <small>{t(preset.description)}</small>
                </button>
              ))}
            </div>

            <div className="ws-field">
              <label htmlFor="household-description">
                <span>{t('Mô tả bữa ăn của nhà bạn')}</span>
              </label>
              <textarea
                aria-describedby="household-description-count"
                id="household-description"
                maxLength={300}
                onChange={(event) => update('household_description', event.target.value)}
                placeholder={t(
                  'Ví dụ: 2 chị em 25 và 22 tuổi, hoặc gia đình nhỏ 3 người: bố mẹ và bạn nhỏ 12 tuổi',
                )}
                rows={2}
                value={draft.household_description}
              />
              <small id="household-description-count">
                {t('{count}/300 ký tự', { count: draft.household_description.length })}
              </small>
            </div>
            <button
              className="text-button"
              disabled={!draft.household_description.trim()}
              onClick={applyDescription}
              type="button"
            >
              <AppIcon name="sparkles" size={16} /> {t('Gợi ý thành viên từ mô tả')}
            </button>

            <div className="member-table" role="table" aria-label={t('Thành viên trong bữa ăn')}>
              <div className="member-table__head" role="row">
                <span role="columnheader">{t('Thành viên')}</span>
                <span role="columnheader">{t('Tuổi')}</span>
                <span role="columnheader">{t('Khẩu vị')}</span>
                <span role="columnheader">{t('Suất')}</span>
                <span aria-hidden="true" />
              </div>
              {draft.household_members.length === 0 ? (
                <p className="member-table__empty">
                  {t('Chưa có thành viên. Chọn mẫu phía trên hoặc thêm từng người.')}
                </p>
              ) : (
                draft.household_members.map((member, index) => (
                  <div className="member-table__row" key={index} role="row">
                    <input
                      aria-label={t('Tên gọi thành viên {index}', { index: index + 1 })}
                      maxLength={40}
                      onChange={(event) => updateMember(index, { label: event.target.value })}
                      value={member.label}
                    />
                    <input
                      aria-label={t('Tuổi của {name}', { name: member.label })}
                      max={120}
                      min={0}
                      onChange={(event) =>
                        updateMember(index, {
                          age: Math.max(0, Math.min(120, Number(event.target.value) || 0)),
                        })
                      }
                      type="number"
                      value={member.age}
                    />
                    <select
                      aria-label={t('Khẩu vị của {name}', { name: member.label })}
                      onChange={(event) =>
                        updateMember(index, { appetite: event.target.value as Appetite })
                      }
                      value={member.appetite}
                    >
                      {(Object.keys(appetiteLabels) as Appetite[]).map((key) => (
                        <option key={key} value={key}>
                          {t(appetiteLabels[key])}
                        </option>
                      ))}
                    </select>
                    <span className="member-table__portion">
                      ×
                      {formatNumber(portionFactor(member.age, member.appetite), {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <button
                      aria-label={t('Xóa {name}', { name: member.label })}
                      className="icon-button icon-button--small"
                      onClick={() =>
                        update(
                          'household_members',
                          draft.household_members.filter((_, position) => position !== index),
                        )
                      }
                      type="button"
                    >
                      <AppIcon name="trash" size={15} />
                    </button>
                  </div>
                ))
              )}
              <button
                className="button button--outline member-table__add"
                disabled={draft.household_members.length >= 12}
                onClick={() =>
                  update('household_members', [
                    ...draft.household_members,
                    {
                      label: t('Thành viên {index}', { index: draft.household_members.length + 1 }),
                      age: 30,
                      appetite: 'normal',
                    },
                  ])
                }
                type="button"
              >
                <AppIcon name="plus" size={16} /> {t('Thêm thành viên')}
              </button>
            </div>

            <div className="servings-result">
              <div>
                <span>{t('Khẩu phần mặc định mỗi bữa')}</span>
                <strong>{t('{count} suất', { count: servings })}</strong>
                <small>
                  {draft.servings_mode === 'auto' && draft.household_members.length
                    ? t(
                        'Quy đổi ≈ {portions} suất người lớn (trẻ nhỏ và người lớn tuổi ăn ít hơn).',
                        {
                          portions: formatNumber(portions, { maximumFractionDigits: 1 }),
                        },
                      )
                    : t('Đang dùng số suất bạn tự đặt.')}
                </small>
              </div>
              <div className="servings-result__controls">
                <div className="segmented-control segmented-control--soft">
                  {(['auto', 'manual'] as const).map((mode) => (
                    <button
                      aria-pressed={draft.servings_mode === mode}
                      className={draft.servings_mode === mode ? 'is-active' : ''}
                      key={mode}
                      onClick={() => update('servings_mode', mode)}
                      type="button"
                    >
                      {mode === 'auto' ? t('Tự tính') : t('Tự đặt')}
                    </button>
                  ))}
                </div>
                {draft.servings_mode === 'manual' ? (
                  <div className="stepper">
                    <button
                      aria-label={t('Giảm khẩu phần')}
                      disabled={draft.manual_servings <= 1}
                      onClick={() => update('manual_servings', draft.manual_servings - 1)}
                      type="button"
                    >
                      <AppIcon name="minus" size={15} />
                    </button>
                    <strong>{draft.manual_servings}</strong>
                    <button
                      aria-label={t('Tăng khẩu phần')}
                      disabled={draft.manual_servings >= 20}
                      onClick={() => update('manual_servings', draft.manual_servings + 1)}
                      type="button"
                    >
                      <AppIcon name="plus" size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel
            description={t('Dùng để gợi ý món và cảnh báo khi món ăn có thể không hợp với bạn.')}
            icon="leaf"
            id="diet"
            title={t('Khẩu vị & chế độ ăn')}
          >
            <div className="ws-fieldset">
              <span className="ws-fieldset__label">{t('Chế độ ăn')}</span>
              <div className="chip-group">
                {(Object.keys(dietaryTagLabels) as DietaryTag[]).map((tag) => (
                  <button
                    aria-pressed={draft.dietary_tags.includes(tag)}
                    className={`chip${draft.dietary_tags.includes(tag) ? ' is-active' : ''}`}
                    key={tag}
                    onClick={() => update('dietary_tags', toggleInList(draft.dietary_tags, tag))}
                    type="button"
                  >
                    {t(dietaryTagLabels[tag])}
                  </button>
                ))}
              </div>
            </div>
            <label className="ws-field">
              <span>{t('Dị ứng hoặc nguyên liệu cần tránh')}</span>
              <input
                maxLength={200}
                onChange={(event) => update('allergies', event.target.value)}
                placeholder={t('Ví dụ: đậu phộng, tôm, sữa')}
                value={draft.allergies}
              />
            </label>
            <div className="ws-grid-2">
              <div className="ws-fieldset">
                <span className="ws-fieldset__label">{t('Độ cay yêu thích')}</span>
                <div className="segmented-control segmented-control--soft">
                  {(
                    [
                      ['mild', 'Không cay'],
                      ['medium', 'Cay vừa'],
                      ['hot', 'Cay nhiều'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      aria-pressed={draft.spice_level === value}
                      className={draft.spice_level === value ? 'is-active' : ''}
                      key={value}
                      onClick={() => update('spice_level', value)}
                      type="button"
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="ws-field">
                <span>{t('Thời gian nấu tối đa mỗi món')}</span>
                <select
                  onChange={(event) => update('max_cooking_minutes', Number(event.target.value))}
                  value={draft.max_cooking_minutes}
                >
                  {cookingTimes.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes ? t('{minutes} phút', { minutes }) : t('Không giới hạn')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ws-fieldset">
              <span className="ws-fieldset__label">{t('Vùng miền yêu thích')}</span>
              <div className="chip-group">
                {regions.map((region) => (
                  <button
                    aria-pressed={draft.preferred_regions.includes(region)}
                    className={`chip${draft.preferred_regions.includes(region) ? ' is-active' : ''}`}
                    key={region}
                    onClick={() =>
                      update('preferred_regions', toggleInList(draft.preferred_regions, region))
                    }
                    type="button"
                  >
                    {t(region)}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </>
      ) : null}

      {!isAdmin && tab === 'notify' ? (
        <>
          <div className="ws-split">
            <Panel icon="calendar" id="planner" title={t('Kế hoạch & thông báo')}>
              <div className="ws-fieldset">
                <span className="ws-fieldset__label">{t('Tuần bắt đầu từ')}</span>
                <div className="segmented-control segmented-control--soft">
                  {(['monday', 'sunday'] as const).map((day) => (
                    <button
                      aria-pressed={draft.week_start === day}
                      className={draft.week_start === day ? 'is-active' : ''}
                      key={day}
                      onClick={() => update('week_start', day)}
                      type="button"
                    >
                      {day === 'monday' ? t('Thứ Hai') : t('Chủ Nhật')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ws-fieldset">
                <span className="ws-fieldset__label">{t('Lịch hiển thị chính')}</span>
                <div className="segmented-control segmented-control--soft">
                  {(['solar', 'lunar'] as const).map((mode) => (
                    <button
                      aria-pressed={draft.calendar_mode === mode}
                      className={draft.calendar_mode === mode ? 'is-active' : ''}
                      key={mode}
                      onClick={() => update('calendar_mode', mode)}
                      type="button"
                    >
                      {mode === 'solar' ? t('Dương lịch') : t('Âm lịch')}
                    </button>
                  ))}
                </div>
                <small className="settings-calendar-preview">
                  <AppIcon name="moon" size={13} />
                  {t('Hôm nay {solar} · {lunar}', {
                    solar: formatDate(`${todayInVietnam}T12:00:00`, { dateStyle: 'medium' }),
                    lunar: formatLunarLong(lunarFromIsoDate(todayInVietnam), t),
                  })}
                </small>
                <small className="settings-calendar-preview__note">
                  {t(
                    'Lịch chạy theo giờ Việt Nam (GMT+7). Đầu trang kế hoạch luôn hiện cả dương lịch và âm lịch.',
                  )}
                </small>
              </div>
              <Toggle
                checked={draft.vegetarian_lunar_days}
                description={t(
                  'Tô vàng mùng 1 và ngày rằm âm lịch trên lịch kế hoạch. Bạn vẫn bật/tắt được từng ngày.',
                )}
                label={t('Tự đánh dấu ăn chay mùng 1 và rằm')}
                onChange={(value) => update('vegetarian_lunar_days', value)}
              />
              <Toggle
                checked={draft.notify_weekly_plan}
                description={t('Nhận email nhắc lên thực đơn vào cuối tuần.')}
                label={t('Nhắc kế hoạch tuần')}
                onChange={(value) => update('notify_weekly_plan', value)}
              />
              <Toggle
                checked={draft.email_meal_plan_reminders}
                description={t(
                  'Nhận email tại địa chỉ đã xác minh: bữa trưa lúc 11:00, bữa tối lúc 17:00 theo giờ Việt Nam (GMT+7). Chỉ gửi khi bữa đó có món trong kế hoạch.',
                )}
                label={t('Email nhắc món trong kế hoạch')}
                onChange={(value) => update('email_meal_plan_reminders', value)}
              />
              <Toggle
                checked={draft.notify_story_updates}
                description={t('Báo khi câu chuyện hoặc món bạn đề xuất được duyệt.')}
                label={t('Cập nhật bài đăng của tôi')}
                onChange={(value) => update('notify_story_updates', value)}
              />
            </Panel>
            <Panel icon="eye" id="privacy" title={t('Quyền riêng tư')}>
              <Toggle
                checked={draft.show_name_on_stories}
                description={t('Tắt để đăng câu chuyện dưới tên “Thành viên Bếp Việt”.')}
                label={t('Hiện tên và ảnh trên câu chuyện')}
                onChange={(value) => update('show_name_on_stories', value)}
              />
              <div className="data-actions">
                <Button
                  isLoading={exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                  variant="secondary"
                >
                  <AppIcon name="download" size={16} /> {t('Tải dữ liệu của tôi')}
                </Button>
                <small>
                  {t('Tệp JSON gồm hồ sơ, thiết lập, món yêu thích, kế hoạch và bài viết.')}
                </small>
              </div>
            </Panel>
          </div>
        </>
      ) : null}

      {isAdmin && tab === 'admin' ? (
        <Panel
          className="ws-panel--admin"
          description={t('Chỉ hiển thị và chỉ lưu được với tài khoản quản trị.')}
          icon="shield"
          id="admin"
          title={t('Thiết lập quản trị')}
        >
          <Toggle
            checked={draft.admin_notify_pending}
            description={t('Hiện số bài viết, món đề xuất và yêu cầu hỗ trợ đang chờ.')}
            label={t('Nhắc nội dung chờ duyệt')}
            onChange={(value) => update('admin_notify_pending', value)}
          />
        </Panel>
      ) : null}

      {tab === 'assistant' ? (
        <>
          <Panel
            description={t(
              'Chọn giọng trò chuyện của Chú Rồng. Nội dung món ăn luôn chính xác như nhau.',
            )}
            icon="sparkles"
            id="assistant-tone"
            title={t('Tính cách Chú Rồng')}
          >
            <Toggle
              checked={draft.assistant_sassy}
              description={
                draft.assistant_sassy
                  ? t(
                      'Đang bật: Chú Rồng trả treo, cà khịa, trêu lại bạn — láo nhưng vẫn trả lời đúng.',
                    )
                  : t('Đang tắt: Chú Rồng trả lời thông minh, dí dỏm, có nhấn nhá như người thật.')
              }
              label={t('Chế độ trả treo')}
              onChange={(value) => update('assistant_sassy', value)}
            />
          </Panel>

          <MemoryPanel />
        </>
      ) : null}

      <div className={`save-bar${dirty ? ' is-visible' : ''}`} aria-hidden={!dirty}>
        <span>
          <AppIcon name="sparkles" size={16} /> {t('Bạn có thay đổi chưa lưu')}
        </span>
        <div>
          <button
            className="text-button"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => {
              setDraft({ ...saved, language });
              setNotice(null);
            }}
            type="button"
          >
            {t('Hoàn tác')}
          </button>
          <Button
            disabled={!dirty}
            isLoading={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ ...draft, language })}
          >
            {t('Lưu cài đặt')}
          </Button>
        </div>
      </div>
    </>
  );
}

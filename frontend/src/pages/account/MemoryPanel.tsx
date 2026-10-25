import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { Notice, Panel } from '@/components/ui/Workspace';
import {
  addMemory,
  clearMemories,
  deleteMemory,
  listMemories,
  memoryKeys,
  updateMemory,
  type AssistantMemory,
  type MemoryKind,
} from '@/features/assistant/assistantApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const KIND: Record<MemoryKind, { label: string; icon: IconName }> = {
  allergy: { label: 'Dị ứng', icon: 'shield' },
  diet: { label: 'Khẩu vị', icon: 'leaf' },
  household: { label: 'Gia đình', icon: 'users' },
  note: { label: 'Ghi chú', icon: 'pen' },
};

/** Những điều Chú Rồng ghi nhớ riêng cho người dùng: xem, thêm, sửa, xóa. */
export function MemoryPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState('');

  const memories = useQuery({
    queryKey: memoryKeys.all,
    queryFn: ({ signal }) => listMemories(signal),
  });
  const items = memories.data?.data ?? [];
  const limit = memories.data?.limit ?? 30;

  const refresh = () => queryClient.invalidateQueries({ queryKey: memoryKeys.all });
  const onError = (mutationError: unknown) => setError(errorMessage(mutationError, t));

  const addMutation = useMutation({
    mutationFn: (content: string) => addMemory(content),
    onSuccess: async () => {
      setDraft('');
      await refresh();
    },
    onError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateMemory(id, content),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: refresh,
    onError,
  });
  const clearMutation = useMutation({
    mutationFn: clearMemories,
    onSuccess: async () => {
      setConfirmClear(false);
      await refresh();
    },
    onError,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (draft.trim().length >= 2) addMutation.mutate(draft.trim());
  };

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (editing && editing.content.trim().length >= 2) {
      updateMutation.mutate({ id: editing.id, content: editing.content.trim() });
    }
  };

  const row = (item: AssistantMemory) => {
    const kind = KIND[item.kind] ?? KIND.note;
    if (editing?.id === item.id) {
      return (
        <li className="memory-list__item is-editing" key={item.id}>
          <form className="memory-list__edit" onSubmit={saveEdit}>
            <input
              aria-label={t('Sửa ghi nhớ')}
              autoFocus
              maxLength={200}
              onChange={(event) => setEditing({ id: item.id, content: event.target.value })}
              value={editing.content}
            />
            <Button isLoading={updateMutation.isPending} type="submit">
              {t('Lưu')}
            </Button>
            <button className="text-button" onClick={() => setEditing(null)} type="button">
              {t('Hủy')}
            </button>
          </form>
        </li>
      );
    }
    return (
      <li className="memory-list__item" key={item.id}>
        <span className={`memory-list__kind memory-list__kind--${item.kind}`}>
          <AppIcon name={kind.icon} size={13} /> {t(kind.label)}
        </span>
        <span className="memory-list__text">{item.content}</span>
        <span className="memory-list__actions">
          <button
            aria-label={t('Sửa ghi nhớ “{content}”', { content: item.content })}
            className="icon-button icon-button--small"
            onClick={() => setEditing({ id: item.id, content: item.content })}
            type="button"
          >
            <AppIcon name="pen" size={14} />
          </button>
          <button
            aria-label={t('Xóa ghi nhớ “{content}”', { content: item.content })}
            className="icon-button icon-button--small"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(item.id)}
            type="button"
          >
            <AppIcon name="trash" size={14} />
          </button>
        </span>
      </li>
    );
  };

  return (
    <Panel
      description={t(
        'Chú Rồng dùng những điều này để gợi ý món hợp với bạn. Chỉ riêng bạn thấy và dùng được.',
      )}
      icon="chef"
      id="memories"
      title={t('Ghi nhớ của Chú Rồng')}
    >
      <p className="memory-hint">
        <AppIcon name="sparkles" size={14} />{' '}
        {t('Mẹo: trong khung chat, nói “Nhớ giúp mình: nhà mình không ăn cay, có 4 người”.')}
      </p>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {memories.isLoading ? (
        <p className="memory-list__empty">{t('Đang tải ghi nhớ…')}</p>
      ) : items.length ? (
        <ul aria-label={t('Danh sách ghi nhớ')} className="memory-list">
          {items.map(row)}
        </ul>
      ) : (
        <p className="memory-list__empty">{t('Chú Rồng chưa ghi nhớ điều gì về bạn.')}</p>
      )}

      <form className="memory-add" onSubmit={submit}>
        <input
          aria-label={t('Ghi nhớ mới')}
          disabled={items.length >= limit}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('Ví dụ: Con mình dị ứng tôm')}
          value={draft}
        />
        <Button
          disabled={draft.trim().length < 2 || items.length >= limit}
          isLoading={addMutation.isPending}
          type="submit"
        >
          <AppIcon name="plus" size={15} /> {t('Thêm')}
        </Button>
      </form>

      <div className="memory-footer">
        <small>{t('{count}/{limit} ghi nhớ', { count: items.length, limit })}</small>
        {items.length ? (
          confirmClear ? (
            <span className="memory-footer__confirm">
              {t('Xóa toàn bộ ghi nhớ?')}
              <button
                className="text-button text-button--danger"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
                type="button"
              >
                {t('Xóa hết')}
              </button>
              <button className="text-button" onClick={() => setConfirmClear(false)} type="button">
                {t('Hủy')}
              </button>
            </span>
          ) : (
            <button className="text-button" onClick={() => setConfirmClear(true)} type="button">
              {t('Quên tất cả')}
            </button>
          )
        ) : null}
      </div>
    </Panel>
  );
}

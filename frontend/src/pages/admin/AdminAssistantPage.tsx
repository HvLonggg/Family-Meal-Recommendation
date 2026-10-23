import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock, Notice, Panel, Toggle } from '@/components/ui/Workspace';
import {
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  knowledgeKeys,
  listKnowledgeDocuments,
  reindexKnowledge,
  teachKnowledgeNote,
  updateKnowledgeDocument,
  uploadKnowledgeFile,
  type KnowledgeDocument,
} from '@/features/admin/adminApi';
import { formatSize, readDataUrl } from '@/features/assistant/attachments';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage, UserFacingError } from '@/lib/errors';

const ACCEPT = '.docx,.pptx,.txt,.md,.csv';
const MAX_BYTES = 8 * 1024 * 1024;
const SUPPORTED = /\.(docx|pptx|txt|md|csv)$/i;

const TYPE_LABELS: Record<string, string> = {
  recipe: 'Đoạn công thức',
  article: 'Đoạn bài viết',
  doc: 'Đoạn tài liệu dạy',
  guide: 'Hướng dẫn website',
};

/** Dạy Chú Rồng: tải tài liệu (.docx, .pptx…) hoặc viết ghi chú để đưa vào kho tri thức RAG. */
export function AdminAssistantPage() {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const documents = useQuery({
    queryKey: knowledgeKeys.documents,
    queryFn: ({ signal }) => listKnowledgeDocuments(signal),
    // Đang đồng bộ hoặc tạo embedding thì cập nhật tiến độ.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && (status.syncing || status.pending > 0) ? 3000 : false;
    },
  });
  const detail = useQuery({
    queryKey: knowledgeKeys.document(openId ?? ''),
    queryFn: ({ signal }) => getKnowledgeDocument(openId ?? '', signal),
    enabled: Boolean(openId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.documents });
  const fail = (error: unknown) => setNotice({ tone: 'danger', text: errorMessage(error, t) });
  const learned = (title: string, characters: number) =>
    setNotice({
      tone: 'success',
      text: t('Chú Rồng đã học “{title}” ({count} ký tự).', {
        title,
        count: characters.toLocaleString('vi-VN'),
      }),
    });

  const uploadMutation = useMutation({
    mutationFn: async (selected: File) =>
      uploadKnowledgeFile({
        file_name: selected.name,
        content_type: selected.type,
        data: await readDataUrl(selected),
        title: fileTitle.trim() || undefined,
      }),
    onSuccess: async (item) => {
      learned(item.title, item.text.length);
      setFile(null);
      setFileTitle('');
      if (fileInput.current) fileInput.current.value = '';
      await refresh();
    },
    onError: fail,
  });
  const noteMutation = useMutation({
    mutationFn: () => teachKnowledgeNote({ title: noteTitle.trim(), text: noteText.trim() }),
    onSuccess: async (item) => {
      learned(item.title, item.text.length);
      setNoteTitle('');
      setNoteText('');
      await refresh();
    },
    onError: fail,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; text?: string; active?: boolean }) =>
      updateKnowledgeDocument(id, payload),
    onSuccess: async (item) => {
      queryClient.setQueryData(knowledgeKeys.document(item.id), item);
      setEditText(null);
      await refresh();
    },
    onError: fail,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDocument(id),
    onSuccess: async () => {
      setConfirmDelete(null);
      setOpenId(null);
      await refresh();
    },
    onError: fail,
  });
  const reindexMutation = useMutation({ mutationFn: reindexKnowledge, onSuccess: refresh });

  const pick = (selected: File | undefined | null) => {
    setNotice(null);
    if (!selected) return;
    if (!SUPPORTED.test(selected.name)) {
      fail(new UserFacingError(t('Chỉ hỗ trợ tệp .docx, .pptx, .txt, .md, .csv.')));
      return;
    }
    if (selected.size > MAX_BYTES) {
      fail(new UserFacingError(t('Tệp vượt quá 8 MB.')));
      return;
    }
    setFile(selected);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    noteMutation.mutate();
  };

  const status = documents.data?.status;
  const items = documents.data?.data ?? [];

  const row = (item: KnowledgeDocument) => {
    const open = openId === item.id;
    return (
      <li className={`teach-doc${item.active ? '' : ' is-off'}`} key={item.id}>
        <div className="teach-doc__head">
          <span className="teach-doc__icon" aria-hidden="true">
            <AppIcon name={item.source === 'file' ? 'file' : 'pen'} size={17} />
          </span>
          <div className="teach-doc__body">
            <strong>{item.title}</strong>
            <small>
              {item.file_name ? `${item.file_name} · ${formatSize(item.size_bytes)} · ` : ''}
              {t('{count} ký tự', { count: item.characters.toLocaleString('vi-VN') })} ·{' '}
              {formatDate(item.created_at, { dateStyle: 'medium' })}
            </small>
            {!open ? <p>{item.preview}</p> : null}
          </div>
          <Toggle
            checked={item.active}
            disabled={updateMutation.isPending}
            label={t('Dùng để trả lời')}
            onChange={(active) => updateMutation.mutate({ id: item.id, active })}
          />
        </div>

        {open ? (
          <div className="teach-doc__detail">
            {detail.isLoading ? (
              <LoadingBlock label={t('Đang tải nội dung…')} />
            ) : (
              <textarea
                aria-label={t('Nội dung Chú Rồng đã học')}
                onChange={(event) => setEditText(event.target.value)}
                rows={10}
                value={editText ?? detail.data?.text ?? ''}
              />
            )}
          </div>
        ) : null}

        <div className="teach-doc__actions">
          <button
            className="text-button"
            onClick={() => {
              setEditText(null);
              setOpenId(open ? null : item.id);
            }}
            type="button"
          >
            <AppIcon name={open ? 'collapse' : 'eye'} size={14} />{' '}
            {open ? t('Thu gọn') : t('Xem & sửa nội dung')}
          </button>
          {open && editText !== null ? (
            <Button
              isLoading={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: item.id, text: editText })}
            >
              <AppIcon name="save" size={14} /> {t('Lưu nội dung')}
            </Button>
          ) : null}
          {confirmDelete === item.id ? (
            <span className="teach-doc__confirm">
              {t('Xóa tài liệu này khỏi trí nhớ Chú Rồng?')}
              <button
                className="text-button text-button--danger"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(item.id)}
                type="button"
              >
                {t('Xóa')}
              </button>
              <button className="text-button" onClick={() => setConfirmDelete(null)} type="button">
                {t('Hủy')}
              </button>
            </span>
          ) : (
            <button
              className="text-button text-button--danger"
              onClick={() => setConfirmDelete(item.id)}
              type="button"
            >
              <AppIcon name="trash" size={14} /> {t('Xóa')}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="admin-section teach">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="teach-stats" aria-label={t('Tình trạng kho tri thức')}>
        <div className="teach-stat">
          <span>{t('Đoạn tri thức')}</span>
          <strong>{status ? status.chunks.toLocaleString('vi-VN') : '—'}</strong>
          <small>
            {status
              ? Object.entries(status.by_type)
                  .map(([type, count]) => `${t(TYPE_LABELS[type] ?? type)}: ${count}`)
                  .join(' · ')
              : ''}
          </small>
        </div>
        <div className="teach-stat">
          <span>{t('Cách tìm kiếm')}</span>
          <strong>
            {status?.retrieval === 'hybrid' ? t('Ngữ nghĩa + từ khóa') : t('Từ khóa (BM25)')}
          </strong>
          <small>
            {status?.retrieval === 'hybrid'
              ? t('Đã tạo embedding {done}/{total} đoạn', {
                  done: status.embedded,
                  total: status.chunks,
                })
              : t('Thêm Gemini API key để tìm theo ngữ nghĩa.')}
          </small>
        </div>
        <div className="teach-stat teach-stat--action">
          <span>{t('Trạng thái')}</span>
          <strong>{status?.syncing ? t('Đang học…') : t('Sẵn sàng')}</strong>
          <Button
            isLoading={reindexMutation.isPending}
            onClick={() => reindexMutation.mutate()}
            variant="secondary"
          >
            <AppIcon name="refresh" size={14} /> {t('Học lại toàn bộ')}
          </Button>
        </div>
      </div>

      <div className="teach-grid">
        <Panel
          description={t(
            'Tải tệp Word (.docx), PowerPoint (.pptx) hoặc văn bản (.txt, .md, .csv) tối đa 8 MB.',
          )}
          icon="upload"
          title={t('Tải tài liệu cho Chú Rồng học')}
        >
          <label
            className={`teach-drop${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={onDrop}
          >
            <input
              accept={ACCEPT}
              aria-label={t('Chọn tệp tài liệu')}
              onChange={(event) => pick(event.target.files?.[0])}
              ref={fileInput}
              type="file"
            />
            <AppIcon name={file ? 'file' : 'upload'} size={26} />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <small>{formatSize(file.size)}</small>
              </>
            ) : (
              <>
                <strong>{t('Kéo thả tệp vào đây hoặc bấm để chọn')}</strong>
                <small>.docx · .pptx · .txt · .md · .csv</small>
              </>
            )}
          </label>
          <div className="teach-row">
            <input
              aria-label={t('Tiêu đề tài liệu (không bắt buộc)')}
              maxLength={200}
              onChange={(event) => setFileTitle(event.target.value)}
              placeholder={t('Tiêu đề (mặc định lấy theo tên tệp)')}
              value={fileTitle}
            />
            <Button
              disabled={!file}
              isLoading={uploadMutation.isPending}
              onClick={() => file && uploadMutation.mutate(file)}
            >
              <AppIcon name="sparkles" size={15} /> {t('Dạy Chú Rồng')}
            </Button>
          </div>
        </Panel>

        <Panel
          description={t('Viết nhanh thông tin riêng của Bếp Việt: chính sách, sự kiện, mẹo bếp…')}
          icon="pen"
          title={t('Viết ghi chú kiến thức')}
        >
          <form className="teach-note" onSubmit={submitNote}>
            <input
              aria-label={t('Tiêu đề ghi chú')}
              maxLength={200}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder={t('Ví dụ: Giờ giao nguyên liệu')}
              value={noteTitle}
            />
            <textarea
              aria-label={t('Nội dung ghi chú')}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder={t('Ví dụ: Bếp Việt giao nguyên liệu nội thành từ 8h đến 20h mỗi ngày.')}
              rows={5}
              value={noteText}
            />
            <Button
              disabled={!noteTitle.trim() || noteText.trim().length < 10}
              isLoading={noteMutation.isPending}
              type="submit"
            >
              <AppIcon name="save" size={15} /> {t('Lưu & dạy')}
            </Button>
          </form>
        </Panel>
      </div>

      <Panel
        description={t(
          'Chú Rồng dùng các tài liệu đang bật để trả lời mọi người dùng và ghi nguồn bên dưới câu trả lời.',
        )}
        icon="book"
        title={t('Tài liệu đã dạy')}
      >
        {documents.isLoading ? (
          <LoadingBlock label={t('Đang tải tài liệu…')} />
        ) : documents.isError ? (
          <Notice tone="danger">{errorMessage(documents.error, t)}</Notice>
        ) : items.length ? (
          <ul className="teach-docs">{items.map(row)}</ul>
        ) : (
          <EmptyState
            description={t('Tải tệp hoặc viết ghi chú để Chú Rồng biết thêm về Bếp Việt.')}
            icon="sparkles"
            title={t('Chưa có tài liệu nào')}
          />
        )}
      </Panel>
    </section>
  );
}

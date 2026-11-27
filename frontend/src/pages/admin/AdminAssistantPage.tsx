import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import { Button } from '@/components/ui/Button';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  Panel,
  Toggle,
} from '@/components/ui/Workspace';
import {
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  knowledgeKeys,
  listKnowledgeDocuments,
  probeKnowledge,
  reindexKnowledge,
  teachKnowledgeNote,
  updateKnowledgeDocument,
  uploadKnowledgeFile,
  type KnowledgeDocument,
  type KnowledgeDocumentDetail,
} from '@/features/admin/adminApi';
import { formatSize, readDataUrl } from '@/features/assistant/attachments';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage, UserFacingError } from '@/lib/errors';

const ACCEPT = '.docx,.pptx,.txt,.md,.csv';
const MAX_BYTES = 8 * 1024 * 1024;
const SUPPORTED = /\.(docx|pptx|txt|md|csv)$/i;
const MIN_NOTE = 10;
const PAGE_SIZE = 10;

const TYPE_LABELS: Record<string, string> = {
  recipe: 'Đoạn công thức',
  article: 'Đoạn bài viết',
  doc: 'Đoạn tài liệu dạy',
  guide: 'Hướng dẫn website',
};

type Tab = 'overview' | 'documents' | 'add' | 'probe';
type ActiveFilter = 'all' | 'on' | 'off';
type SourceFilter = 'all' | 'file' | 'note';
type SortKey = 'updated' | 'title' | 'size';
type DocumentList = Awaited<ReturnType<typeof listKnowledgeDocuments>>;

/** Giá trị trễ một nhịp để ô tìm kiếm không lọc lại trên mỗi phím gõ. */
function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Bỏ dấu để tìm "giao hang" vẫn khớp "giao hàng". */
const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

const EMPTY: KnowledgeDocument[] = [];

const SORTERS: Record<SortKey, (a: KnowledgeDocument, b: KnowledgeDocument) => number> = {
  updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
  title: (a, b) => a.title.localeCompare(b.title, 'vi'),
  size: (a, b) => b.characters - a.characters,
};

function filterDocuments(
  items: KnowledgeDocument[],
  search: string,
  active: ActiveFilter,
  source: SourceFilter,
  sort: SortKey,
) {
  const needle = fold(search.trim());
  return items
    .filter(
      (item) =>
        (active === 'all' || item.active === (active === 'on')) &&
        (source === 'all' || item.source === source) &&
        (!needle || fold(`${item.title} ${item.file_name ?? ''} ${item.preview}`).includes(needle)),
    )
    .sort(SORTERS[sort]);
}

/** Hàng trong danh sách không giữ toàn văn (chỉ có ở bản chi tiết). */
function toRow(item: KnowledgeDocumentDetail): KnowledgeDocument {
  const row: KnowledgeDocument & { text?: string } = { ...item };
  delete row.text;
  return row;
}

/**
 * Quản lý Chú Rồng: tổng quan kho tri thức RAG, danh sách tài liệu đã dạy,
 * thêm tài liệu (.docx, .pptx… hoặc ghi chú) và bảng hỏi thử để xem nguồn được truy xuất.
 */
export function AdminAssistantPage() {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const baseId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('overview');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  // Thêm tài liệu.
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'reading' | 'sending' | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  // Danh sách tài liệu.
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  // Hỏi thử.
  const [question, setQuestion] = useState('');

  const debouncedSearch = useDebouncedValue(search);

  // Danh sách chỉ gồm bản xem trước + kích thước; toàn văn chỉ tải khi mở sửa.
  const documents = useQuery({
    queryKey: knowledgeKeys.documents,
    queryFn: ({ signal }) => listKnowledgeDocuments(signal),
    staleTime: 30_000,
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
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.documents });
  const fail = (error: unknown) => setNotice({ tone: 'danger', text: errorMessage(error, t) });
  const patchList = (update: (items: KnowledgeDocument[]) => KnowledgeDocument[]) =>
    queryClient.setQueryData<DocumentList>(knowledgeKeys.documents, (old) =>
      old ? { ...old, data: update(old.data) } : old,
    );
  const learned = (item: KnowledgeDocumentDetail) => {
    setNotice({
      tone: 'success',
      text: t('Chú Rồng đã học “{title}” ({count} ký tự).', {
        title: item.title,
        count: item.text.length.toLocaleString('vi-VN'),
      }),
    });
    queryClient.setQueryData(knowledgeKeys.document(item.id), item);
    patchList((items) => [toRow(item), ...items.filter((existing) => existing.id !== item.id)]);
  };

  const uploadMutation = useMutation({
    mutationFn: async (selected: File) => {
      setUploadPhase('reading');
      const data = await readDataUrl(selected);
      setUploadPhase('sending');
      return uploadKnowledgeFile({
        file_name: selected.name,
        content_type: selected.type,
        data,
        title: fileTitle.trim() || undefined,
      });
    },
    onSuccess: async (item) => {
      learned(item);
      setFile(null);
      setFileTitle('');
      if (fileInput.current) fileInput.current.value = '';
      await refresh();
    },
    onError: fail,
    onSettled: () => setUploadPhase(null),
  });
  const noteMutation = useMutation({
    mutationFn: () => teachKnowledgeNote({ title: noteTitle.trim(), text: noteText.trim() }),
    onSuccess: async (item) => {
      learned(item);
      setNoteTitle('');
      setNoteText('');
      await refresh();
    },
    onError: fail,
  });
  // Bật/tắt cập nhật lạc quan: đổi ngay trên giao diện, hoàn tác nếu lỗi.
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateKnowledgeDocument(id, { active }),
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: knowledgeKeys.documents });
      const previous = queryClient.getQueryData<DocumentList>(knowledgeKeys.documents);
      patchList((items) => items.map((item) => (item.id === id ? { ...item, active } : item)));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(knowledgeKeys.documents, context.previous);
      fail(error);
    },
    onSettled: refresh,
  });
  const saveMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; text?: string; title?: string }) =>
      updateKnowledgeDocument(id, payload),
    onSuccess: async (item) => {
      queryClient.setQueryData(knowledgeKeys.document(item.id), item);
      patchList((items) =>
        items.map((existing) => (existing.id === item.id ? toRow(item) : existing)),
      );
      setEditText(null);
      setEditTitle(null);
      setNotice({ tone: 'success', text: t('Đã lưu “{title}”.', { title: item.title }) });
      await refresh();
    },
    onError: fail,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDocument(id),
    onSuccess: async (_data, id) => {
      patchList((items) => items.filter((item) => item.id !== id));
      queryClient.removeQueries({ queryKey: knowledgeKeys.document(id) });
      if (openId === id) setOpenId(null);
      setNotice({ tone: 'success', text: t('Đã xóa tài liệu khỏi trí nhớ Chú Rồng.') });
      await refresh();
    },
    onError: fail,
  });
  const reindexMutation = useMutation({
    mutationFn: reindexKnowledge,
    onSuccess: (status) => {
      queryClient.setQueryData<DocumentList>(knowledgeKeys.documents, (old) =>
        old ? { ...old, status } : old,
      );
      return refresh();
    },
    onError: fail,
  });
  const probeMutation = useMutation({
    mutationFn: (query: string) => probeKnowledge({ query }),
  });

  const status = documents.data?.status;
  const items = documents.data?.data ?? EMPTY;
  const activeCount = items.filter((item) => item.active).length;
  const lastUpdated = items.reduce<string | null>(
    (latest, item) => (!latest || item.updated_at > latest ? item.updated_at : latest),
    null,
  );
  // React Compiler tự ghi nhớ kết quả theo các đầu vào này.
  const filtered = filterDocuments(items, debouncedSearch, activeFilter, sourceFilter, sort);

  // Xóa bớt tài liệu thì không kẹt ở một trang trống.
  const pageOffset = offset < filtered.length ? offset : 0;
  const pageItems = filtered.slice(pageOffset, pageOffset + PAGE_SIZE);

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
    if (selected.size === 0) {
      fail(new UserFacingError(t('Tệp trống, hãy chọn tệp khác.')));
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

  const submitProbe = (event: FormEvent) => {
    event.preventDefault();
    const query = question.trim();
    if (query.length >= 2) probeMutation.mutate(query);
  };

  const askDelete = async (item: KnowledgeDocument) => {
    const ok = await confirm({
      title: t('Xóa tài liệu này khỏi trí nhớ Chú Rồng?'),
      description: t('“{title}” sẽ bị xóa vĩnh viễn và không còn dùng để trả lời.', {
        title: item.title,
      }),
      confirmLabel: t('Xóa'),
      tone: 'danger',
    });
    if (ok !== null) deleteMutation.mutate(item.id);
  };

  const discardEdit = () => {
    setEditText(null);
    setEditTitle(null);
  };

  const probeTypeLabel = (type: string) =>
    ({
      recipe: t('Công thức'),
      article: t('Bài viết'),
      doc: t('Tài liệu dạy'),
      guide: t('Hướng dẫn website'),
    })[type] ?? type;

  const tabs: { id: Tab; label: string; icon: IconName; count?: number }[] = [
    { id: 'overview', label: t('Tổng quan'), icon: 'chart' },
    { id: 'documents', label: t('Tài liệu dạy rồng'), icon: 'book', count: items.length },
    { id: 'add', label: t('Thêm tài liệu'), icon: 'plus' },
    { id: 'probe', label: t('Hỏi thử rồng'), icon: 'message' },
  ];
  const tabId = (id: Tab) => `${baseId}-tab-${id}`;
  const panelId = (id: Tab) => `${baseId}-panel-${id}`;
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
    const next = tabs[(index + step) % tabs.length]!;
    setTab(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  const embedPercent =
    status && status.chunks ? Math.round((status.embedded / status.chunks) * 100) : 0;

  const overview = (
    <div className="teach-overview">
      <div className="teach-stats" aria-label={t('Tình trạng kho tri thức')}>
        <div className="teach-stat">
          <span>{t('Tài liệu đã dạy')}</span>
          <strong>{documents.data ? items.length.toLocaleString('vi-VN') : '—'}</strong>
          <small>
            {documents.data
              ? t('{active} đang bật · {off} đang tắt', {
                  active: activeCount,
                  off: items.length - activeCount,
                })
              : ''}
          </small>
        </div>
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
          {status?.retrieval === 'hybrid' ? (
            <>
              <small>
                {t('Đã tạo embedding {done}/{total} đoạn', {
                  done: status.embedded,
                  total: status.chunks,
                })}
              </small>
              <progress
                aria-label={t('Tiến độ nhúng vector')}
                className="teach-progress"
                max={100}
                value={embedPercent}
              />
            </>
          ) : (
            <small>{t('Thêm Gemini API key để tìm theo ngữ nghĩa.')}</small>
          )}
        </div>
        <div className="teach-stat teach-stat--action">
          <span>{t('Trạng thái')}</span>
          <strong aria-live="polite">
            {status?.syncing
              ? t('Đang học…')
              : status && status.pending > 0
                ? t('Còn {count} đoạn chờ nhúng', { count: status.pending })
                : t('Sẵn sàng')}
          </strong>
          <small>
            {lastUpdated
              ? t('Tài liệu sửa gần nhất: {date}', {
                  date: formatDate(lastUpdated, { dateStyle: 'medium', timeStyle: 'short' }),
                })
              : t('Chưa có tài liệu nào')}
          </small>
          <Button
            isLoading={reindexMutation.isPending}
            onClick={() => reindexMutation.mutate()}
            variant="secondary"
          >
            <AppIcon name="refresh" size={14} /> {t('Học lại toàn bộ')}
          </Button>
        </div>
      </div>
      {documents.isError ? <Notice tone="danger">{errorMessage(documents.error, t)}</Notice> : null}
      <div className="teach-shortcuts">
        <Button onClick={() => setTab('add')} variant="secondary">
          <AppIcon name="plus" size={14} /> {t('Thêm tài liệu')}
        </Button>
        <Button onClick={() => setTab('documents')} variant="secondary">
          <AppIcon name="book" size={14} /> {t('Xem tài liệu đã dạy')}
        </Button>
        <Button onClick={() => setTab('probe')} variant="secondary">
          <AppIcon name="message" size={14} /> {t('Hỏi thử rồng')}
        </Button>
      </div>
    </div>
  );

  const row = (item: KnowledgeDocument) => {
    const open = openId === item.id;
    const dirty = editText !== null || editTitle !== null;
    return (
      <li className={`teach-doc${item.active ? '' : ' is-off'}`} key={item.id}>
        <div className="teach-doc__head">
          <span className="teach-doc__icon" aria-hidden="true">
            <AppIcon name={item.source === 'file' ? 'file' : 'pen'} size={17} />
          </span>
          <div className="teach-doc__body">
            <strong>{item.title}</strong>
            <small>
              {item.source === 'file'
                ? `${item.file_name ?? t('Tệp')} · ${formatSize(item.size_bytes)}`
                : t('Ghi chú')}{' '}
              · {t('{count} ký tự', { count: item.characters.toLocaleString('vi-VN') })} ·{' '}
              {t('Cập nhật {date}', {
                date: formatDate(item.updated_at, { dateStyle: 'medium' }),
              })}
            </small>
            {!open ? <p>{item.preview}</p> : null}
          </div>
          <Toggle
            checked={item.active}
            label={t('Dùng để trả lời')}
            onChange={(active) => toggleMutation.mutate({ id: item.id, active })}
          />
        </div>

        {open ? (
          <div className="teach-doc__detail">
            {detail.isLoading ? (
              <LoadingBlock label={t('Đang tải nội dung…')} />
            ) : detail.isError ? (
              <Notice tone="danger">{errorMessage(detail.error, t)}</Notice>
            ) : (
              <>
                <input
                  aria-label={t('Tiêu đề tài liệu')}
                  maxLength={200}
                  onChange={(event) => setEditTitle(event.target.value)}
                  value={editTitle ?? detail.data?.title ?? item.title}
                />
                <textarea
                  aria-label={t('Nội dung Chú Rồng đã học')}
                  onChange={(event) => setEditText(event.target.value)}
                  rows={10}
                  value={editText ?? detail.data?.text ?? ''}
                />
              </>
            )}
          </div>
        ) : null}

        <div className="teach-doc__actions">
          <button
            aria-expanded={open}
            className="text-button"
            onClick={() => {
              discardEdit();
              setOpenId(open ? null : item.id);
            }}
            type="button"
          >
            <AppIcon name={open ? 'collapse' : 'pen'} size={14} />{' '}
            {open ? t('Thu gọn') : t('Xem & sửa nội dung')}
          </button>
          {open && dirty ? (
            <>
              <Button
                disabled={
                  (editText !== null && editText.trim().length < MIN_NOTE) ||
                  (editTitle !== null && !editTitle.trim())
                }
                isLoading={saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate({
                    id: item.id,
                    ...(editText !== null ? { text: editText } : {}),
                    ...(editTitle !== null ? { title: editTitle.trim() } : {}),
                  })
                }
              >
                <AppIcon name="save" size={14} /> {t('Lưu nội dung')}
              </Button>
              <button className="text-button" onClick={discardEdit} type="button">
                {t('Bỏ thay đổi')}
              </button>
            </>
          ) : null}
          <button
            aria-label={t('Xóa “{title}”', { title: item.title })}
            className="text-button text-button--danger"
            disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
            onClick={() => void askDelete(item)}
            type="button"
          >
            <AppIcon name="trash" size={14} /> {t('Xóa')}
          </button>
        </div>
      </li>
    );
  };

  const onFilter =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setOffset(0);
    };

  const documentsPanel = (
    <Panel
      description={t(
        'Chú Rồng dùng các tài liệu đang bật để trả lời mọi người dùng và ghi nguồn bên dưới câu trả lời.',
      )}
      icon="book"
      title={t('Tài liệu đã dạy')}
    >
      <div className="teach-toolbar">
        <label className="teach-search">
          <AppIcon name="search" size={16} />
          <input
            aria-label={t('Tìm tài liệu')}
            onChange={(event) => onFilter(setSearch)(event.target.value)}
            placeholder={t('Tìm theo tiêu đề, tên tệp, nội dung…')}
            type="search"
            value={search}
          />
        </label>
        <select
          aria-label={t('Lọc theo trạng thái')}
          onChange={(event) => onFilter(setActiveFilter)(event.target.value as ActiveFilter)}
          value={activeFilter}
        >
          <option value="all">{t('Mọi trạng thái')}</option>
          <option value="on">{t('Đang bật')}</option>
          <option value="off">{t('Đang tắt')}</option>
        </select>
        <select
          aria-label={t('Lọc theo nguồn')}
          onChange={(event) => onFilter(setSourceFilter)(event.target.value as SourceFilter)}
          value={sourceFilter}
        >
          <option value="all">{t('Mọi nguồn')}</option>
          <option value="file">{t('Tệp tải lên')}</option>
          <option value="note">{t('Ghi chú')}</option>
        </select>
        <select
          aria-label={t('Sắp xếp')}
          onChange={(event) => onFilter(setSort)(event.target.value as SortKey)}
          value={sort}
        >
          <option value="updated">{t('Mới cập nhật')}</option>
          <option value="title">{t('Tên A–Z')}</option>
          <option value="size">{t('Dài nhất')}</option>
        </select>
      </div>

      {documents.isLoading ? (
        <LoadingBlock label={t('Đang tải tài liệu…')} />
      ) : documents.isError ? (
        <Notice tone="danger">
          {errorMessage(documents.error, t)}{' '}
          <button className="text-button" onClick={() => void documents.refetch()} type="button">
            {t('Thử lại')}
          </button>
        </Notice>
      ) : !items.length ? (
        <EmptyState
          action={
            <Button onClick={() => setTab('add')}>
              <AppIcon name="plus" size={14} /> {t('Thêm tài liệu')}
            </Button>
          }
          description={t('Tải tệp hoặc viết ghi chú để Chú Rồng biết thêm về Bếp Việt.')}
          icon="sparkles"
          title={t('Chưa có tài liệu nào')}
        />
      ) : !filtered.length ? (
        <EmptyState
          description={t('Thử từ khóa khác hoặc bỏ bớt bộ lọc.')}
          icon="search"
          title={t('Không có tài liệu phù hợp')}
        />
      ) : (
        <>
          <p className="teach-count" aria-live="polite">
            {t('{count} tài liệu', { count: filtered.length })}
          </p>
          <ul className="teach-docs">{pageItems.map(row)}</ul>
          <Pagination
            labels={{
              next: t('Trang sau'),
              previous: t('Trang trước'),
              summary: t('{from}–{to} trong {total}', {
                from: pageOffset + 1,
                to: Math.min(pageOffset + PAGE_SIZE, filtered.length),
                total: filtered.length,
              }),
            }}
            limit={PAGE_SIZE}
            offset={pageOffset}
            onChange={setOffset}
            total={filtered.length}
          />
        </>
      )}
    </Panel>
  );

  const noteLength = noteText.trim().length;
  const addPanel = (
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
            disabled={uploadMutation.isPending}
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
        {uploadPhase ? (
          <p className="teach-phase" role="status">
            {uploadPhase === 'reading' ? t('Đang đọc tệp…') : t('Đang gửi và trích xuất nội dung…')}
          </p>
        ) : null}
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
            aria-describedby={`${baseId}-note-hint`}
            aria-label={t('Nội dung ghi chú')}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder={t('Ví dụ: Bếp Việt giao nguyên liệu nội thành từ 8h đến 20h mỗi ngày.')}
            rows={5}
            value={noteText}
          />
          <small
            className={`teach-hint${noteText && noteLength < MIN_NOTE ? ' is-warn' : ''}`}
            id={`${baseId}-note-hint`}
          >
            {noteLength < MIN_NOTE
              ? t('Cần ít nhất {min} ký tự ({count}/{min}).', { min: MIN_NOTE, count: noteLength })
              : t('{count} ký tự', { count: noteLength.toLocaleString('vi-VN') })}
          </small>
          <Button
            disabled={!noteTitle.trim() || noteLength < MIN_NOTE}
            isLoading={noteMutation.isPending}
            type="submit"
          >
            <AppIcon name="save" size={15} /> {t('Lưu & dạy')}
          </Button>
        </form>
      </Panel>
    </div>
  );

  const probe = probeMutation.data;
  const probePanel = (
    <Panel
      description={t(
        'Gõ một câu hỏi để xem Chú Rồng tìm được những đoạn tri thức nào. Bảng này chỉ kiểm tra truy xuất, không tạo câu trả lời và không tốn lượt AI.',
      )}
      icon="message"
      title={t('Hỏi thử Chú Rồng')}
    >
      <form className="teach-probe" onSubmit={submitProbe}>
        <input
          aria-label={t('Câu hỏi thử')}
          maxLength={500}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('Ví dụ: Bếp Việt giao nguyên liệu mấy giờ?')}
          value={question}
        />
        <Button
          disabled={question.trim().length < 2}
          isLoading={probeMutation.isPending}
          type="submit"
        >
          <AppIcon name="search" size={15} /> {t('Tìm nguồn')}
        </Button>
      </form>
      {probeMutation.isError ? (
        <Notice tone="danger">{errorMessage(probeMutation.error, t)}</Notice>
      ) : probe ? (
        probe.hits.length ? (
          <ol className="teach-hits" aria-label={t('Nguồn tri thức tìm được')}>
            {probe.hits.map((hit, index) => (
              <li className="teach-hit" key={`${hit.source_type}:${hit.source_key}:${index}`}>
                <div className="teach-hit__head">
                  <span className="teach-hit__rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <strong>
                    {hit.url ? (
                      <a href={hit.url} rel="noreferrer" target="_blank">
                        {hit.title}
                      </a>
                    ) : (
                      hit.title
                    )}
                  </strong>
                  <span className="teach-hit__type">{probeTypeLabel(hit.source_type)}</span>
                </div>
                <p>{hit.snippet}</p>
                <small>
                  {t('Điểm {score}', { score: hit.score.toFixed(3) })}
                  {hit.lexical ? ` · BM25 ${hit.lexical.toFixed(2)}` : ''}
                  {hit.dense ? ` · ${t('Ngữ nghĩa')} ${hit.dense.toFixed(2)}` : ''}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            description={t(
              'Chú Rồng sẽ trả lời bằng kiến thức chung. Hãy thêm tài liệu nếu đây là thông tin riêng của Bếp Việt.',
            )}
            icon="search"
            title={t('Không tìm thấy đoạn tri thức phù hợp')}
          />
        )
      ) : null}
    </Panel>
  );

  const panels: Record<Tab, ReactNode> = {
    overview,
    documents: documentsPanel,
    add: addPanel,
    probe: probePanel,
  };

  return (
    <section className="admin-section teach">
      <div className="tab-pills teach-tabs" role="tablist" aria-label={t('Quản lý Chú Rồng')}>
        {tabs.map((item) => (
          <button
            aria-controls={tab === item.id ? panelId(item.id) : undefined}
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            id={tabId(item.id)}
            key={item.id}
            onClick={() => setTab(item.id)}
            onKeyDown={onTabKey}
            role="tab"
            tabIndex={tab === item.id ? 0 : -1}
            type="button"
          >
            <AppIcon name={item.icon} size={15} /> {item.label}
            {item.count !== undefined && documents.data ? (
              <span className="teach-tabs__count">{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div aria-labelledby={tabId(tab)} id={panelId(tab)} role="tabpanel">
        {panels[tab]}
      </div>
      {dialog}
    </section>
  );
}

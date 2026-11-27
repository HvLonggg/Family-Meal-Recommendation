import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  listKnowledgeDocuments,
  probeKnowledge,
  teachKnowledgeNote,
  updateKnowledgeDocument,
  uploadKnowledgeFile,
  type KnowledgeStatus,
} from '@/features/admin/adminApi';
import { AdminAssistantPage } from '@/pages/admin/AdminAssistantPage';

vi.mock('@/features/admin/adminApi', () => ({
  knowledgeKeys: {
    documents: ['admin', 'assistant', 'documents'],
    document: (id: string) => ['admin', 'assistant', 'document', id],
  },
  listKnowledgeDocuments: vi.fn(),
  getKnowledgeDocument: vi.fn(),
  teachKnowledgeNote: vi.fn(),
  uploadKnowledgeFile: vi.fn(),
  updateKnowledgeDocument: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  reindexKnowledge: vi.fn(),
  probeKnowledge: vi.fn(),
}));

const document = {
  id: 'doc-1',
  title: 'Chính sách giao hàng',
  source: 'file' as const,
  file_name: 'giao-hang.docx',
  size_bytes: 2048,
  active: true,
  characters: 1200,
  preview: 'Bếp Việt giao nguyên liệu nội thành từ 8 giờ đến 20 giờ.',
  created_at: '2026-10-21T08:00:00Z',
  updated_at: '2026-10-21T08:00:00Z',
};
const note = {
  ...document,
  id: 'doc-2',
  title: 'Giờ mở cửa',
  source: 'note' as const,
  file_name: null,
  size_bytes: 0,
  characters: 40,
  preview: 'Mở cửa 9 giờ sáng thứ Bảy.',
  updated_at: '2026-11-01T08:00:00Z',
};

const bm25: KnowledgeStatus = {
  chunks: 42,
  by_type: { recipe: 30, doc: 4, guide: 8 },
  embedding_model: null,
  embedded: 0,
  pending: 0,
  retrieval: 'bm25',
  syncing: false,
};

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminAssistantPage />
    </QueryClientProvider>,
  );
}

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }));

describe('AdminAssistantPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('shows the knowledge overview and adds a .docx file and a note', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue({ data: [document], status: bm25 });
    vi.mocked(uploadKnowledgeFile).mockResolvedValue({ ...document, text: 'x'.repeat(1200) });
    vi.mocked(teachKnowledgeNote).mockResolvedValue({
      ...note,
      text: 'Mở cửa 9 giờ sáng thứ Bảy.',
    });
    renderPage();

    expect(await screen.findByText('Từ khóa (BM25)')).toBeInTheDocument();
    expect(await screen.findByText('1 đang bật · 0 đang tắt')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    openTab(/Thêm tài liệu/);
    const file = new File(['fake-docx'], 'giao-hang.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(screen.getByLabelText('Chọn tệp tài liệu'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Dạy Chú Rồng/ }));
    await waitFor(() => expect(uploadKnowledgeFile).toHaveBeenCalled());
    expect(uploadKnowledgeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        file_name: 'giao-hang.docx',
        data: expect.stringMatching(/^data:.*;base64,/) as string,
      }),
    );
    expect(await screen.findByText(/Chú Rồng đã học/)).toBeInTheDocument();

    const save = screen.getByRole('button', { name: /Lưu & dạy/ });
    fireEvent.change(screen.getByLabelText('Tiêu đề ghi chú'), { target: { value: 'Giờ mở cửa' } });
    fireEvent.change(screen.getByLabelText('Nội dung ghi chú'), { target: { value: 'Ngắn' } });
    expect(screen.getByText('Cần ít nhất 10 ký tự (4/10).')).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nội dung ghi chú'), {
      target: { value: 'Mở cửa 9 giờ sáng thứ Bảy.' },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(teachKnowledgeNote).toHaveBeenCalledWith({
        title: 'Giờ mở cửa',
        text: 'Mở cửa 9 giờ sáng thứ Bảy.',
      }),
    );
  });

  it('rejects unsupported files', () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue({ data: [], status: bm25 });
    renderPage();
    openTab(/Thêm tài liệu/);
    fireEvent.change(screen.getByLabelText('Chọn tệp tài liệu'), {
      target: { files: [new File(['x'], 'cu.doc')] },
    });
    expect(screen.getByText('Chỉ hỗ trợ tệp .docx, .pptx, .txt, .md, .csv.')).toBeInTheDocument();
    expect(uploadKnowledgeFile).not.toHaveBeenCalled();
  });

  it('filters, edits, toggles optimistically and deletes via the in-app dialog', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue({
      data: [document, note],
      status: { ...bm25, retrieval: 'hybrid', embedding_model: 'gemini', embedded: 42 },
    });
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ ...document, text: 'Toàn văn tài liệu.' });
    // Giữ treo để kiểm tra giao diện đã đổi trước khi máy chủ trả lời.
    vi.mocked(updateKnowledgeDocument).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(deleteKnowledgeDocument).mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPage();

    await screen.findByText('Ngữ nghĩa + từ khóa');
    openTab(/Tài liệu dạy rồng/);
    expect(await screen.findByText('2 tài liệu')).toBeInTheDocument();
    // Ghi chú mới cập nhật đứng đầu.
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Giờ mở cửa');

    fireEvent.change(screen.getByLabelText('Lọc theo nguồn'), { target: { value: 'file' } });
    expect(screen.queryByText('Giờ mở cửa')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lọc theo nguồn'), { target: { value: 'all' } });

    // Tìm kiếm không dấu, có debounce.
    fireEvent.change(screen.getByLabelText('Tìm tài liệu'), { target: { value: 'giao hang' } });
    await waitFor(() => expect(screen.queryByText('Giờ mở cửa')).not.toBeInTheDocument());
    expect(screen.getByText('Chính sách giao hàng')).toBeInTheDocument();

    // Chỉ khi mở sửa mới tải toàn văn.
    expect(getKnowledgeDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Xem & sửa nội dung/ }));
    expect(await screen.findByDisplayValue('Toàn văn tài liệu.')).toBeInTheDocument();
    expect(getKnowledgeDocument).toHaveBeenCalledWith('doc-1', expect.anything());

    fireEvent.click(screen.getByRole('switch', { name: /Dùng để trả lời/ }));
    await waitFor(() =>
      expect(updateKnowledgeDocument).toHaveBeenCalledWith('doc-1', { active: false }),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Dùng để trả lời/ })).not.toBeChecked(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xóa “Chính sách giao hàng”' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(deleteKnowledgeDocument).toHaveBeenCalledWith('doc-1'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('shows the retrieved sources when testing a question', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue({ data: [document], status: bm25 });
    vi.mocked(probeKnowledge)
      .mockResolvedValueOnce({
        query: 'giao mấy giờ',
        retrieval: 'bm25',
        hits: [
          {
            title: 'Chính sách giao hàng',
            source_type: 'doc',
            source_key: 'doc-1',
            url: '',
            snippet: 'Bếp Việt giao nguyên liệu nội thành từ 8 giờ đến 20 giờ.',
            score: 0.0164,
            lexical: 3.2,
            dense: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ query: 'xyz', retrieval: 'bm25', hits: [] });
    renderPage();

    openTab(/Hỏi thử rồng/);
    const button = screen.getByRole('button', { name: /Tìm nguồn/ });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Câu hỏi thử'), { target: { value: 'giao mấy giờ' } });
    fireEvent.click(button);
    const hits = await screen.findByRole('list', { name: 'Nguồn tri thức tìm được' });
    expect(within(hits).getByText('Chính sách giao hàng')).toBeInTheDocument();
    expect(within(hits).getByText('Tài liệu dạy')).toBeInTheDocument();
    expect(probeKnowledge).toHaveBeenCalledWith({ query: 'giao mấy giờ' });

    fireEvent.change(screen.getByLabelText('Câu hỏi thử'), { target: { value: 'xyz' } });
    fireEvent.click(button);
    expect(await screen.findByText('Không tìm thấy đoạn tri thức phù hợp')).toBeInTheDocument();
  });
});

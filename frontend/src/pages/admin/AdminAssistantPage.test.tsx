import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  teachKnowledgeNote,
  updateKnowledgeDocument,
  uploadKnowledgeFile,
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

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AdminAssistantPage />
    </QueryClientProvider>,
  );
}

describe('AdminAssistantPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uploads a .docx file and writes a note for the assistant to learn', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue({
      data: [document],
      status: {
        chunks: 42,
        by_type: { recipe: 30, doc: 4, guide: 8 },
        embedding_model: null,
        embedded: 0,
        pending: 0,
        retrieval: 'bm25',
        syncing: false,
      },
    });
    vi.mocked(uploadKnowledgeFile).mockResolvedValue({ ...document, text: 'x'.repeat(1200) });
    vi.mocked(teachKnowledgeNote).mockResolvedValue({
      ...document,
      id: 'doc-2',
      source: 'note',
      title: 'Giờ mở cửa',
      text: 'Mở cửa 9 giờ sáng thứ Bảy.',
    });
    renderPage();

    expect(await screen.findByText('Chính sách giao hàng')).toBeInTheDocument();
    expect(screen.getByText('Từ khóa (BM25)')).toBeInTheDocument();

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

    fireEvent.change(screen.getByLabelText('Tiêu đề ghi chú'), { target: { value: 'Giờ mở cửa' } });
    fireEvent.change(screen.getByLabelText('Nội dung ghi chú'), {
      target: { value: 'Mở cửa 9 giờ sáng thứ Bảy.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu & dạy/ }));
    await waitFor(() =>
      expect(teachKnowledgeNote).toHaveBeenCalledWith({
        title: 'Giờ mở cửa',
        text: 'Mở cửa 9 giờ sáng thứ Bảy.',
      }),
    );
  });

  it('rejects unsupported files and toggles or deletes documents', async () => {
    vi.mocked(listKnowledgeDocuments).mockResolvedValue({
      data: [document],
      status: {
        chunks: 4,
        by_type: { doc: 4 },
        embedding_model: 'gemini-embedding-2',
        embedded: 4,
        pending: 0,
        retrieval: 'hybrid',
        syncing: false,
      },
    });
    vi.mocked(updateKnowledgeDocument).mockResolvedValue({ ...document, active: false, text: '' });
    vi.mocked(deleteKnowledgeDocument).mockResolvedValue(undefined);
    renderPage();

    await screen.findByText('Chính sách giao hàng');
    fireEvent.change(screen.getByLabelText('Chọn tệp tài liệu'), {
      target: { files: [new File(['x'], 'cu.doc')] },
    });
    expect(screen.getByText('Chỉ hỗ trợ tệp .docx, .pptx, .txt, .md, .csv.')).toBeInTheDocument();
    expect(uploadKnowledgeFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch', { name: /Dùng để trả lời/ }));
    await waitFor(() =>
      expect(updateKnowledgeDocument).toHaveBeenCalledWith('doc-1', { active: false }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Xóa/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(deleteKnowledgeDocument).toHaveBeenCalledWith('doc-1'));
  });
});

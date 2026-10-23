import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addMemory,
  clearMemories,
  deleteMemory,
  listMemories,
  updateMemory,
} from '@/features/assistant/assistantApi';
import { MemoryPanel } from '@/pages/account/MemoryPanel';

vi.mock('@/features/assistant/assistantApi', () => ({
  memoryKeys: { all: ['assistant', 'memories'] },
  listMemories: vi.fn(),
  addMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  clearMemories: vi.fn(),
}));

const memory = (id: string, content: string, kind = 'note') => ({
  id,
  content,
  kind,
  created_at: '2026-10-21T08:00:00Z',
  updated_at: '2026-10-21T08:00:00Z',
});

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryPanel />
    </QueryClientProvider>,
  );
}

describe('MemoryPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists, adds, edits and deletes memories', async () => {
    vi.mocked(listMemories).mockResolvedValue({
      data: [memory('m1', 'Con dị ứng tôm', 'allergy'), memory('m2', 'Có 4 người', 'household')],
      limit: 30,
    } as Awaited<ReturnType<typeof listMemories>>);
    vi.mocked(addMemory).mockResolvedValue(memory('m3', 'Thích ăn canh') as never);
    vi.mocked(updateMemory).mockResolvedValue(memory('m2', 'Có 5 người') as never);
    vi.mocked(deleteMemory).mockResolvedValue(undefined);
    renderPanel();

    const list = await screen.findByRole('list', { name: 'Danh sách ghi nhớ' });
    expect(within(list).getByText('Con dị ứng tôm')).toBeInTheDocument();
    expect(within(list).getByText('Dị ứng')).toBeInTheDocument();
    expect(screen.getByText('2/30 ghi nhớ')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ghi nhớ mới'), { target: { value: 'Thích ăn canh' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm/ }));
    await waitFor(() => expect(addMemory).toHaveBeenCalledWith('Thích ăn canh'));

    fireEvent.click(screen.getByRole('button', { name: 'Sửa ghi nhớ “Có 4 người”' }));
    fireEvent.change(screen.getByLabelText('Sửa ghi nhớ'), { target: { value: 'Có 5 người' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateMemory).toHaveBeenCalledWith('m2', 'Có 5 người'));

    fireEvent.click(screen.getByRole('button', { name: 'Xóa ghi nhớ “Con dị ứng tôm”' }));
    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith('m1'));
  });

  it('asks for confirmation before forgetting everything', async () => {
    vi.mocked(listMemories).mockResolvedValue({
      data: [memory('m1', 'Không ăn hành', 'diet')],
      limit: 30,
    } as Awaited<ReturnType<typeof listMemories>>);
    vi.mocked(clearMemories).mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Quên tất cả' }));
    expect(clearMemories).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa hết' }));
    await waitFor(() => expect(clearMemories).toHaveBeenCalled());
  });
});

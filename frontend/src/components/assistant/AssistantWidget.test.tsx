import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantWidget } from '@/components/assistant/AssistantWidget';
import type * as AssistantApi from '@/features/assistant/assistantApi';
import { I18nProvider } from '@/features/i18n/I18nContext';

const api = vi.hoisted(() => ({
  getAssistantStatus: vi.fn(),
  sendAssistantMessage: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
  clearConversations: vi.fn(),
}));
const authState = vi.hoisted(() => ({ user: null as null | { id: string } }));

// Mặc định buổi tối (giờ Việt Nam) để câu gợi ý nhanh cố định trong test.
vi.mock('@/features/assistant/dayPart', async (importActual) => ({
  ...(await importActual<object>()),
  dayPart: () => 'toi',
}));

vi.mock('@/features/assistant/assistantApi', async () => ({
  ...(await vi.importActual<typeof AssistantApi>('@/features/assistant/assistantApi')),
  ...api,
  // Luồng trả lời dùng chung kịch bản với sendAssistantMessage và phát một đoạn chữ trước.
  streamAssistantMessage: async (
    payload: AssistantApi.ChatPayload,
    handlers: { onDelta: (text: string) => void },
  ) => {
    handlers.onDelta('Đang viết…');
    return (await api.sendAssistantMessage(payload)) as AssistantApi.ChatResult;
  },
}));
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));

const reply = (content: string, extra: Partial<AssistantApi.AssistantMessage> = {}) => ({
  id: `reply-${content.length}`,
  role: 'assistant' as const,
  content,
  created_at: '2026-10-19T12:00:00Z',
  recipes: [],
  suggestions: [],
  actions: [],
  attachments: [],
  mode: 'local' as const,
  ...extra,
});

function renderWidget() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter>
          <AssistantWidget />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  api.getAssistantStatus.mockResolvedValue({
    mode: 'local',
    name: 'Chú Rồng',
    accepts: ['image/png'],
    max_attachments: 3,
  });
  api.sendAssistantMessage.mockImplementation((payload: AssistantApi.ChatPayload) =>
    Promise.resolve({
      conversation_id: authState.user ? 'conv-1' : null,
      title: payload.message,
      user_message: {
        ...reply(payload.message),
        id: `user-${payload.message}`,
        role: 'user',
        mode: null,
      },
      reply: reply('Chú Rồng chọn giúp bạn **Canh chua cá**:', {
        recipes: [
          {
            slug: 'canh-chua-ca',
            name: 'Canh chua cá',
            image_path: '/images/canh-chua-ca.jpg',
            region: 'Nam',
            category: 'Món canh',
            minutes: 35,
            difficulty: 'Dễ',
          },
        ],
        suggestions: ['Đổi món khác'],
      }),
    }),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('AssistantWidget', () => {
  it('opens the chat, sends a question and shows recipe cards with follow-ups', async () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý Chú Rồng' }));
    const panel = screen.getByRole('dialog', { name: 'Trò chuyện với Chú Rồng' });
    expect(within(panel).getByText('Chú Rồng')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Tối nay ăn gì?' }));
    expect(await within(panel).findByRole('link', { name: /Canh chua cá/ })).toHaveAttribute(
      'href',
      '/recipes/canh-chua-ca',
    );
    expect(api.sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Tối nay ăn gì?', language: 'vi', conversation_id: null }),
    );

    fireEvent.click(within(panel).getByRole('button', { name: 'Đổi món khác' }));
    await waitFor(() => expect(api.sendAssistantMessage).toHaveBeenCalledTimes(2));
    // Khách gửi kèm lịch sử và các món đã gợi ý để tránh lặp món.
    const [second] = api.sendAssistantMessage.mock.calls[1] as [AssistantApi.ChatPayload];
    expect(second.history?.map((item) => item.role)).toEqual(['user', 'assistant']);
    expect(second.recent_recipes).toEqual(['canh-chua-ca']);
  });

  it('shows the reply while it is being written, before the full answer arrives', async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.sendAssistantMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý Chú Rồng' }));
    const panel = screen.getByRole('dialog');
    // Câu gợi ý nhanh theo buổi giờ Việt Nam (test cố định buổi tối).
    fireEvent.click(within(panel).getByRole('button', { name: 'Tối nay ăn gì?' }));
    expect(await within(panel).findByText('Đang viết…')).toBeInTheDocument();
    finish({
      conversation_id: null,
      title: 'Tối nay ăn gì?',
      user_message: { ...reply('Tối nay ăn gì?'), id: 'u1', role: 'user', mode: null },
      reply: reply('Tối nay ăn **Canh chua cá** nhé!', { id: 'r1' }),
    });
    expect(await within(panel).findByText('Canh chua cá')).toBeInTheDocument();
    expect(within(panel).queryByText('Đang viết…')).not.toBeInTheDocument();
  });

  it('keeps guest history in the browser and reopens past chats', async () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý Chú Rồng' }));
    const panel = screen.getByRole('dialog');
    fireEvent.change(within(panel).getByLabelText('Nhập tin nhắn cho Chú Rồng'), {
      target: { value: 'Món canh dễ nấu' },
    });
    fireEvent.keyDown(within(panel).getByLabelText('Nhập tin nhắn cho Chú Rồng'), {
      key: 'Enter',
    });
    await within(panel).findByRole('link', { name: /Canh chua cá/ });

    fireEvent.click(within(panel).getByRole('button', { name: 'Trò chuyện mới' }));
    expect(within(panel).getByText('Mình là Chú Rồng', { exact: false })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Lịch sử trò chuyện' }));
    expect(
      within(panel).getByText('Lịch sử đang lưu trên trình duyệt này', { exact: false }),
    ).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /^Món canh dễ nấu/ }));
    expect(await within(panel).findByRole('link', { name: /Canh chua cá/ })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Lịch sử trò chuyện' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Xóa Món canh dễ nấu' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Xóa' }));
    expect(
      await within(panel).findByText('Chưa có cuộc trò chuyện nào', { exact: false }),
    ).toBeInTheDocument();
  });

  it('marks a failed message and resends it', async () => {
    api.sendAssistantMessage.mockRejectedValueOnce(new TypeError('Failed to fetch /internal/path'));
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý Chú Rồng' }));
    const panel = screen.getByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: 'Gợi ý mâm cơm 4 người' }));
    // Lỗi mạng/lập trình không bao giờ hiện nguyên văn cho người dùng.
    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra. Vui lòng thử lại.');
    expect(alert).not.toHaveTextContent('internal');
    fireEvent.click(within(panel).getByRole('button', { name: /Gửi lại/ }));
    expect(await within(panel).findByRole('link', { name: /Canh chua cá/ })).toBeInTheDocument();
  });

  it('saves member chats on the server', async () => {
    authState.user = { id: 'user-1' };
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý Chú Rồng' }));
    const panel = screen.getByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: 'Tối nay ăn gì?' }));
    await within(panel).findByRole('link', { name: /Canh chua cá/ });
    fireEvent.click(within(panel).getByRole('button', { name: 'Đổi món khác' }));
    await waitFor(() =>
      expect(api.sendAssistantMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ conversation_id: 'conv-1', history: undefined }),
      ),
    );
  });
});

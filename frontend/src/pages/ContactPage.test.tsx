import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactPage } from '@/pages/ContactPage';
import type * as SupportApi from '@/features/support/supportApi';

const api = vi.hoisted(() => ({
  createSupportTicket: vi.fn(),
  getSupportContactInfo: vi.fn(),
  listMySupportTickets: vi.fn(),
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', full_name: 'Nguyễn Ngọc Lan', email: 'lan@example.com' },
  }),
}));

vi.mock('@/features/i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (text: string, vars?: Record<string, string | number>) =>
      text.replace(/\{(\w+)\}/g, (_match, key: string) => String(vars?.[key] ?? `{${key}}`)),
    formatDate: () => '24/10/2026 10:00',
  }),
}));

vi.mock('@/features/support/supportApi', async () => ({
  ...(await vi.importActual<typeof SupportApi>('@/features/support/supportApi')),
  ...api,
}));

const ticket = {
  id: 'ticket-1',
  name: 'Nguyễn Ngọc Lan',
  email: 'lan@example.com',
  topic: 'general' as const,
  subject: 'Xin tư vấn món chay',
  message: 'Tôi muốn xin gợi ý một mâm cơm chay cho gia đình.',
  status: 'resolved' as const,
  reply_status: 'sent' as const,
  reply_subject: 'Bếp Việt phản hồi yêu cầu',
  reply_message: 'Bạn có thể kết hợp đậu hũ kho nấm với canh rau củ.',
  reply_sent_at: '2026-10-24T03:00:00Z',
  created_at: '2026-10-23T03:00:00Z',
  updated_at: '2026-10-24T03:00:00Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.createSupportTicket.mockResolvedValue({
    id: 'ticket-2',
    reference: 'BV-TEST',
    support_email: 'hvlongg@gmail.com',
    message: 'Yêu cầu đã được tiếp nhận.',
  });
  api.getSupportContactInfo.mockResolvedValue({
    support_email: 'hvlongg@gmail.com',
    response_sla_business_hours: 24,
  });
  api.listMySupportTickets.mockResolvedValue({ data: [ticket], total: 1 });
});

afterEach(cleanup);

describe('ContactPage', () => {
  it('identifies the sender email, fixed support inbox, response time, and sent reply', async () => {
    renderPage();

    expect(await screen.findByLabelText(/Email người gửi/)).toHaveValue('lan@example.com');
    // Email hỗ trợ và cam kết 24 giờ chỉ hiện một lần mỗi thứ.
    expect(await screen.findAllByText('hvlongg@gmail.com')).toHaveLength(1);
    expect(screen.getAllByText(/trong vòng 24 giờ làm việc/)).toHaveLength(1);
    expect(await screen.findByText('Phản hồi từ Bếp Việt')).toBeInTheDocument();
    expect(
      screen.getByText('Bạn có thể kết hợp đậu hũ kho nấm với canh rau củ.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Ghi chú nội bộ')).not.toBeInTheDocument();
  });

  it('submits the sender address as the reply-to address', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/Tiêu đề/), {
      target: { value: 'Hỏi cách chọn món chay' },
    });
    fireEvent.change(screen.getByLabelText(/Nội dung/), {
      target: { value: 'Tôi muốn xin gợi ý món chay dễ nấu cho bữa tối gia đình.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/ }));

    await waitFor(() => expect(api.createSupportTicket).toHaveBeenCalled());
    expect(api.createSupportTicket.mock.calls[0]?.[0]).toMatchObject({
      email: 'lan@example.com',
      subject: 'Hỏi cách chọn món chay',
    });
  });

  it('does not display a frontend email when the server inbox cannot be loaded', async () => {
    api.getSupportContactInfo.mockRejectedValue(new Error('Network unavailable'));
    renderPage();

    expect(await screen.findByText('Hòm thư hỗ trợ chưa tải được')).toBeInTheDocument();
    expect(screen.getByText(/Chưa tải được địa chỉ hòm thư hỗ trợ/)).toBeInTheDocument();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });
});

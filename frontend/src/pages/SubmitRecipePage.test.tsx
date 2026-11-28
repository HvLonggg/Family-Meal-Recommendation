import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/features/i18n/I18nContext';
import { SubmitRecipePage } from '@/pages/SubmitRecipePage';

const api = vi.hoisted(() => ({ createSubmission: vi.fn(), updateSubmission: vi.fn() }));

vi.mock('@/features/submissions/submissionsApi', async (importActual) => ({
  ...(await importActual<object>()),
  ...api,
}));
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/submit-recipe']}>
          <Routes>
            <Route element={<SubmitRecipePage />} path="/submit-recipe" />
            <Route element={<p>Danh sách đề xuất</p>} path="/account/submissions" />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('SubmitRecipePage', () => {
  it('chỉ bắt buộc tên món, các phần khác ghi rõ là không bắt buộc', () => {
    renderPage();

    expect(screen.getByPlaceholderText('Ví dụ: Thịt kho trứng của mẹ')).toBeRequired();
    for (const label of ['Câu chuyện hoặc mô tả ngắn', 'Nguyên liệu chính', 'Các bước thực hiện']) {
      expect(screen.getByLabelText(new RegExp(label))).not.toBeRequired();
    }
    expect(screen.getAllByText('Không bắt buộc').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('Chỉ tên món là bắt buộc.')).toBeInTheDocument();
  });

  it('gửi được đề xuất chỉ có tên món', async () => {
    api.createSubmission.mockResolvedValue({ id: 's-1' });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Ví dụ: Thịt kho trứng của mẹ'), {
      target: { value: 'Bánh đúc nóng' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gửi đề xuất/ }));

    await waitFor(() => expect(api.createSubmission).toHaveBeenCalledTimes(1));
    expect(api.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bánh đúc nóng',
        story: '',
        ingredients: '',
        steps: '',
        total_minutes: 0,
        submit: true,
      }),
    );
    expect(await screen.findByText('Danh sách đề xuất')).toBeInTheDocument();
  });
});

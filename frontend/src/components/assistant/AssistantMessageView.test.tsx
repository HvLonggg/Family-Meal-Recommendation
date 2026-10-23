import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AssistantMessageView } from '@/components/assistant/AssistantMessageView';
import { I18nProvider } from '@/features/i18n/I18nContext';

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

describe('AssistantMessageView', () => {
  it('links the knowledge sources a grounded reply was based on', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <AssistantMessageView
            canSpeak={false}
            isLatest
            message={{
              id: 'reply-1',
              role: 'assistant',
              content: 'Ướp gà 30 phút rồi kho lửa nhỏ nhé!',
              created_at: '2026-10-21T12:00:00Z',
              recipes: [],
              suggestions: [],
              actions: [],
              attachments: [],
              sources: [
                { title: 'Gà kho gừng', url: '/recipes/ga-kho-gung', kind: 'recipe' },
                { title: 'Mẹo bảo quản rau thơm', url: '/articles/rau-thom', kind: 'article' },
              ],
              mode: 'ai',
            }}
            onNavigate={vi.fn()}
            onSuggestion={vi.fn()}
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    const sources = screen.getByLabelText('Nguồn tham khảo');
    expect(screen.getByRole('link', { name: /Gà kho gừng/ })).toHaveAttribute(
      'href',
      '/recipes/ga-kho-gung',
    );
    expect(sources).toHaveTextContent('Mẹo bảo quản rau thơm');
  });
});

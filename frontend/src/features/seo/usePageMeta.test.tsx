import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalUrl, usePageMeta, useRouteDocumentMeta } from '@/features/seo/usePageMeta';

const i18n = vi.hoisted(() => {
  const state: { language: 'vi' | 'en' } = { language: 'vi' };
  return state;
});
const english: Record<string, string> = { 'Bếp Việt': 'Bep Viet' };
const translate = {
  vi: (text: string) => text,
  en: (text: string) => english[text] ?? text,
};

vi.mock('@/features/i18n/I18nContext', () => ({
  useI18n: () => ({ language: i18n.language, t: translate[i18n.language] }),
}));

afterEach(() => {
  cleanup();
  i18n.language = 'vi';
});

function Recipe({ name }: { name: string }) {
  useRouteDocumentMeta();
  usePageMeta({ title: name, description: `${name} mô tả`, image: '/images/recipes/x.jpg' });
  return (
    <main>
      <h1>{name}</h1>
    </main>
  );
}

const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute('content');

describe('document meta', () => {
  it('uses page details for title, description, Open Graph and canonical', () => {
    render(
      <MemoryRouter initialEntries={['/recipes/canh-chua-ca/']}>
        <Recipe name="Canh chua cá" />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Bếp Việt');
    expect(meta('meta[name="description"]')).toBe('Canh chua cá mô tả');
    expect(meta('meta[property="og:title"]')).toBe('Canh chua cá · Bếp Việt');
    expect(meta('meta[property="og:image"]')).toBe(
      'https://bepviet-vn.vercel.app/images/recipes/x.jpg',
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://bepviet-vn.vercel.app/recipes/canh-chua-ca',
    );
  });

  it('updates the title as soon as the language changes', () => {
    const view = render(
      <MemoryRouter initialEntries={['/recipes/canh-chua-ca']}>
        <Recipe name="Canh chua cá" />
      </MemoryRouter>,
    );
    i18n.language = 'en';
    view.rerender(
      <MemoryRouter initialEntries={['/recipes/canh-chua-ca']}>
        <Recipe name="Vietnamese sour fish soup" />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Bep Viet');
    expect(meta('meta[property="og:locale"]')).toBe('en_US');
  });

  it('builds canonical URLs on the production domain', () => {
    expect(canonicalUrl('/')).toBe('https://bepviet-vn.vercel.app/');
    expect(canonicalUrl('/recipes/')).toBe('https://bepviet-vn.vercel.app/recipes');
  });
});

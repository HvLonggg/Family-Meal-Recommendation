import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fixture from '@/data/__fixtures__/apiRecipe.json';
import type { ApiRecipe } from '@/data/recipeApi';
import { apiRequest } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
  apiPost: vi.fn(),
  setAccessToken: vi.fn(),
  setSessionHandlers: vi.fn(),
}));

const apiRecipe = fixture as ApiRecipe;
const CACHE_NAME = 'bep-viet-catalog-v1';

/** Cache Storage giả lập trong bộ nhớ (jsdom không có `caches`). */
function stubCacheStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('/__bep-viet/recipe-catalog.json', initial);
  const cache = {
    match: vi.fn((key: string) =>
      Promise.resolve(store.has(key) ? new Response(store.get(key)) : undefined),
    ),
    put: vi.fn(async (key: string, response: Response) => {
      store.set(key, await response.text());
    }),
  };
  vi.stubGlobal('caches', { open: vi.fn(() => Promise.resolve(cache)) });
  return { store, cache };
}

// Mỗi test cần bản mới của module vì startRecipeCatalog chỉ chạy một lần mỗi phiên.
async function loadModules() {
  vi.resetModules();
  const api = await import('@/data/recipeApi');
  const store = await import('@/data/recipes');
  const client = await import('@/lib/api/client');
  return { ...api, ...store, apiRequest: vi.mocked(client.apiRequest) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(apiRequest).mockReset();
  localStorage.clear();
});

describe('startRecipeCatalog', () => {
  it('renders from the catalog saved on this device and refreshes it in the background', async () => {
    const saved = JSON.stringify({ data: [apiRecipe], total: 1 });
    stubCacheStorage(saved);
    localStorage.setItem('bep-viet.catalog-persisted', CACHE_NAME);
    const modules = await loadModules();
    const changedRecipe = { ...apiRecipe, name: 'Tên mới từ máy chủ' };
    modules.apiRequest.mockResolvedValue({ data: [changedRecipe], total: 1 });
    const notified = vi.fn();
    modules.subscribeRecipeCatalog(notified);

    await expect(modules.startRecipeCatalog()).resolves.toBe('cache');
    expect(modules.getRecipeCatalogSource()).toBe('cache');
    expect(modules.getRecipeCatalog().map((recipe) => recipe.slug)).toEqual([apiRecipe.slug]);
    expect(notified).toHaveBeenCalled();
    // Chưa gọi API trước khi trình duyệt rảnh.
    expect(modules.apiRequest).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(modules.apiRequest).toHaveBeenCalled();
    expect(modules.getRecipeCatalogSource()).toBe('online');
    expect(modules.getRecipeCatalog()[0]?.name).toBe('Tên mới từ máy chủ');
  });

  it('loads from the API on a first visit and saves the catalog for the next one', async () => {
    const { store } = stubCacheStorage();
    const modules = await loadModules();
    modules.apiRequest.mockResolvedValue({ data: [apiRecipe], total: 1 });

    expect(modules.getRecipeCatalogSource()).toBe('loading');
    await expect(modules.startRecipeCatalog()).resolves.toBe('online');
    expect(modules.getRecipeCatalog()).toHaveLength(1);

    await vi.runAllTimersAsync();
    expect(JSON.parse(store.get('/__bep-viet/recipe-catalog.json') ?? '{}')).toEqual({
      data: [apiRecipe],
      total: 1,
    });
    expect(localStorage.getItem('bep-viet.catalog-persisted')).toBe(CACHE_NAME);
  });

  it('settles on the bundled dishes instead of rejecting when nothing can be loaded', async () => {
    const modules = await loadModules();
    const bundled = modules.getRecipeCatalog();
    modules.apiRequest.mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const start = modules.startRecipeCatalog();
    await vi.runAllTimersAsync();
    await expect(start).resolves.toBe('fallback');
    expect(modules.getRecipeCatalogSource()).toBe('fallback');
    expect(modules.getRecipeCatalog()).toBe(bundled);
  });
});

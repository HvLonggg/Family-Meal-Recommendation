import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginUpdate, cancelUpdate, finishUpdate } from './updateState';
import { activateUpdate } from './pwa';

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('update completion', () => {
  it('reports success only once after the build changes', () => {
    beginUpdate('old');
    expect(finishUpdate('new')).toBe('success');
    expect(finishUpdate('new')).toBeNull();
  });
  it('does not claim success when the old build reloads', () => {
    beginUpdate('old');
    expect(finishUpdate('old')).toBe('failed');
  });
  it('clears cancelled and expired attempts', () => {
    beginUpdate('old');
    cancelUpdate();
    expect(finishUpdate('new')).toBeNull();
    vi.useFakeTimers();
    beginUpdate('old');
    vi.advanceTimersByTime(600001);
    expect(finishUpdate('new')).toBeNull();
  });
  it('waits for controller handover and removes its listener', async () => {
    const controller = new EventTarget();
    // jsdom không có navigator.serviceWorker: gắn tạm một EventTarget giả.
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: controller });
    const remove = vi.spyOn(controller, 'removeEventListener');
    const postMessage = vi.fn();
    const promise = activateUpdate({ postMessage } as unknown as ServiceWorker);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    controller.dispatchEvent(new Event('controllerchange'));
    await promise;
    expect(remove).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });
});

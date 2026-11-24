/* Service worker của Bếp Việt.
 * - Web Push cho chuông hẹn giờ khi vào bếp (giữ nguyên hành vi cũ).
 * - Cache app-shell + ảnh món để mở nhanh và dùng tạm khi mất mạng.
 * Không bao giờ cache /api (dữ liệu cá nhân, đăng nhập) hay request khác origin. */

// __BUILD_ID__ được thay bằng mã build mỗi lần deploy (vite.config.ts) để trình duyệt nhận bản mới.
const VERSION = 'bv-__BUILD_ID__';
const SHELL_CACHE = `bep-viet-shell-${VERSION}`;
const ASSET_CACHE = `bep-viet-assets-${VERSION}`;
const IMAGE_CACHE = 'bep-viet-images-v1';
const DATA_CACHE = 'bep-viet-data-v1';
const KEEP = [SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE, DATA_CACHE];
const MAX_IMAGES = 150;
const MAX_ASSETS = 80;
const OFFLINE_URL = '/offline.html';
const SHELL_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/images/brand/icon-192.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined),
  );
  // Lần cài đầu chưa có bản cũ: kích hoạt ngay. Bản cập nhật thì chờ người dùng bấm "Cập nhật".
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('bep-viet-') && !KEEP.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

function cacheable(response) {
  return response && response.ok && response.type === 'basic';
}

async function staleWhileRevalidate(event, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then(async (response) => {
      if (cacheable(response)) {
        await cache.put(event.request, response.clone());
        await trimCache(cacheName, max);
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (cacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      // Lưu app-shell mới nhất (SPA: mọi route dùng chung index.html).
      const cache = await caches.open(SHELL_CACHE);
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/')) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dữ liệu cá nhân / đăng nhập / admin: luôn đi thẳng mạng, không cache.
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (request.headers.has('authorization')) return;

  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/admin')) return;
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Tệp build có hash trong tên: bất biến, dùng cache trước.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then(async (response) => {
            if (cacheable(response)) {
              const cache = await caches.open(ASSET_CACHE);
              await cache.put(request, response.clone());
              await trimCache(ASSET_CACHE, MAX_ASSETS);
            }
            return response;
          }),
      ),
    );
    return;
  }
  if (url.pathname.startsWith('/images/')) {
    event.respondWith(staleWhileRevalidate(event, IMAGE_CACHE, MAX_IMAGES));
    return;
  }
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
});

// --- Web Push: chuông hẹn giờ khi vào bếp ------------------------------------------------

const ACTIONS = [
  { action: 'done', title: 'Xong rồi' },
  { action: 'snooze', title: 'Thêm 5 phút' },
];

function safeUrl(value) {
  // Chỉ mở trang vào bếp của chính ứng dụng.
  return typeof value === 'string' && value.startsWith('/cook') && !value.startsWith('//')
    ? value
    : '/cook';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const url = safeUrl(data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.filter((client) => client.visibilityState === 'visible');
      // Trang đang mở trên màn hình đã tự đổ chuông: chỉ báo cho trang, không hiện trùng.
      if (visible.length) {
        for (const client of visible) {
          client.postMessage({ type: 'cook-timer-due', timerId: data.timer_id });
        }
        return;
      }
      await self.registration.showNotification(data.title || '⏰ Hết giờ rồi!', {
        body: data.body || 'Đến giờ kiểm tra món rồi.',
        tag: data.tag || 'cook-timer',
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400],
        icon: '/images/brand/icon-192.png',
        badge: '/images/brand/icon-192.png',
        data: { url, timer_id: data.timer_id },
        actions: ACTIONS,
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action === 'done' || event.action === 'snooze' ? event.action : 'open';
  const base = safeUrl(data.url);
  const target = new URL(base, self.location.origin);
  if (data.timer_id) target.searchParams.set('timer', data.timer_id);
  if (action !== 'open') target.searchParams.set('timerAction', action);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const cooking = windows.find((client) => new URL(client.url).pathname === '/cook');
      if (cooking) {
        cooking.postMessage({ type: 'cook-timer-action', timerId: data.timer_id, action });
        await cooking.focus();
        return;
      }
      await self.clients.openWindow(target.pathname + target.search);
    })(),
  );
});

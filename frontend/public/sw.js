/* Service worker của Bếp Việt.
 * - Web Push cho chuông hẹn giờ khi vào bếp (giữ nguyên hành vi cũ).
 * - Cache app-shell + ảnh món để mở nhanh và dùng tạm khi mất mạng.
 * Không bao giờ cache /api (dữ liệu cá nhân, đăng nhập) hay request khác origin.
 * Cache chỉ là phần phụ: CacheStorage lỗi (hết quota, hỏng, chế độ riêng tư) không bao giờ được
 * làm hỏng một response mạng đã thành công. Mọi thao tác cache đều tự bắt lỗi riêng. */

// __BUILD_ID__ được thay bằng mã build mỗi lần deploy (vite.config.ts) để trình duyệt nhận bản mới.
const VERSION = 'bv-__BUILD_ID__';
const SHELL_CACHE = `bep-viet-shell-${VERSION}`;
const ASSET_CACHE = `bep-viet-assets-${VERSION}`;
const IMAGE_CACHE = 'bep-viet-images-v1';
const DATA_CACHE = 'bep-viet-data-v1';
// Kho món trang tự lưu (src/data/recipeApi.ts) để lần mở sau hiện ngay: không được dọn khi cập nhật.
const CATALOG_CACHE = 'bep-viet-catalog-v1';
const KEEP = [SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE, DATA_CACHE, CATALOG_CACHE];
const MAX_IMAGES = 150;
const MAX_ASSETS = 80;
const OFFLINE_URL = '/offline.html';
const SHELL_URLS = [
  '/',
  OFFLINE_URL,
  '/offline.js',
  '/manifest.webmanifest',
  '/images/brand/icon-192.png',
  '/icons/apple-touch-icon.png',
];
// Bản lưu sẵn kho món: app chỉ đọc khi API lỗi/chậm, nên nạp sẵn một lần mỗi bản build để vẫn
// dùng được khi mất mạng (thay vì tải 1 MB ở mọi lần mở trang).
const CATALOG_SNAPSHOT_URL = '/data/recipe-catalog.json';

async function openCache(name) {
  try {
    return await caches.open(name);
  } catch {
    return undefined;
  }
}

async function matchCache(name, request) {
  try {
    const cache = await openCache(name);
    return cache ? await cache.match(request) : undefined;
  } catch {
    return undefined;
  }
}

async function putCache(name, request, response, max) {
  try {
    const cache = await openCache(name);
    if (!cache) return;
    await cache.put(request, response);
    if (max) await trimCache(cache, max);
  } catch {
    // Không ghi được cache: bỏ qua, response mạng vẫn được trả cho trang.
  }
}

async function trimCache(cache, max) {
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
  } catch {
    // Dọn cache là việc phụ.
  }
}

// Ghi cache ở nền (không chặn response); event.waitUntil giữ SW sống tới khi ghi xong.
function storeInBackground(event, name, request, response, max) {
  const task = putCache(name, request, response, max);
  try {
    event.waitUntil(task);
  } catch {
    // waitUntil có thể ném nếu sự kiện đã kết thúc; task vẫn chạy và tự bắt lỗi.
  }
}

async function precache(name, urls) {
  const cache = await openCache(name);
  if (!cache) return;
  // Từng URL riêng: một tệp lỗi không làm hỏng cả lần cài đặt.
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: 'no-cache' }));
        if (cacheable(response)) await cache.put(url, response);
      } catch {
        // Bỏ qua: tệp sẽ được lưu ở lần tải thật sau.
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await precache(SHELL_CACHE, SHELL_URLS);
        await precache(DATA_CACHE, [CATALOG_SNAPSHOT_URL]);
      } catch {
        // Precache thất bại không được chặn việc cài SW.
      }
    })(),
  );
  // Lần cài đầu chưa có bản cũ: kích hoạt ngay. Bản cập nhật thì chờ người dùng bấm "Cập nhật".
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith('bep-viet-') && !KEEP.includes(name))
            .map((name) => caches.delete(name).catch(() => false)),
        );
      } catch {
        // Không dọn được cache cũ: lần kích hoạt sau sẽ thử lại.
      }
      try {
        await self.clients.claim();
      } catch {
        // Trang sẽ được điều khiển ở lần tải sau.
      }
    })(),
  );
});

function cacheable(response) {
  return response && response.ok && response.type === 'basic';
}

async function staleWhileRevalidate(event, cacheName, max) {
  const { request } = event;
  const cached = await matchCache(cacheName, request);
  const network = fetch(request)
    .then((response) => {
      if (cacheable(response)) storeInBackground(event, cacheName, request, response.clone(), max);
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    try {
      event.waitUntil(network);
    } catch {
      // Bỏ qua.
    }
    return cached;
  }
  return (await network) || Response.error();
}

async function networkFirst(event, cacheName) {
  const { request } = event;
  try {
    const response = await fetch(request);
    if (cacheable(response)) storeInBackground(event, cacheName, request, response.clone());
    return response;
  } catch {
    return (await matchCache(cacheName, request)) || Response.error();
  }
}

async function cacheFirst(event, cacheName, max) {
  const { request } = event;
  // Tệp build có hash trong tên: bất biến. caches.match tìm ở mọi cache (kể cả bản precache).
  let cached;
  try {
    cached = await caches.match(request);
  } catch {
    cached = undefined;
  }
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) storeInBackground(event, cacheName, request, response.clone(), max);
  return response;
}

async function handleNavigation(event) {
  const { request } = event;
  try {
    const response = await fetch(request);
    // Lưu app-shell mới nhất (SPA: mọi route dùng chung index.html).
    if (cacheable(response)) storeInBackground(event, SHELL_CACHE, '/', response.clone());
    return response;
  } catch {
    return (
      (await matchCache(SHELL_CACHE, '/')) ||
      (await matchCache(SHELL_CACHE, OFFLINE_URL)) ||
      Response.error()
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dữ liệu cá nhân / đăng nhập / admin: luôn đi thẳng mạng, không cache.
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  // Tệp cho bot (không phải trang SPA): không lưu nhầm thành app-shell '/'.
  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') return;
  if (request.headers.has('authorization')) return;

  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/admin')) return;
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event, ASSET_CACHE, MAX_ASSETS));
    return;
  }
  if (url.pathname.startsWith('/images/')) {
    event.respondWith(staleWhileRevalidate(event, IMAGE_CACHE, MAX_IMAGES));
    return;
  }
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(networkFirst(event, DATA_CACHE));
    return;
  }
  // Tệp của trang ngoại tuyến (script, icon, manifest): ưu tiên mạng, mất mạng thì dùng bản precache.
  if (SHELL_URLS.includes(url.pathname) && url.pathname !== '/') {
    event.respondWith(networkFirst(event, SHELL_CACHE));
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

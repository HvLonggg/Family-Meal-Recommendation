/* Service worker của Bếp Việt: chỉ nhận thông báo đẩy cho chuông hẹn giờ khi vào bếp.
 * Không chặn request (không có fetch handler) nên không ảnh hưởng cách tải trang. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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

/** Chỉ quay lại đường dẫn nội bộ của ứng dụng; chặn chuyển hướng sang trang ngoài. */
export function safeReturnPath(path: string | undefined) {
  // "//host" và "/\host" bị trình duyệt hiểu là trang ngoài. Trình duyệt còn bỏ ký tự điều
  // khiển (tab, xuống dòng) khỏi URL, nên "/\t/host" cũng thành "//host": chặn luôn.
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\'))
    return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return /^\/(login|register|forgot-password|reset-password|oauth-callback)(\/|\?|#|$)/.test(path)
    ? null
    : path;
}

export function landingPath(role: string, requested: string | undefined) {
  const path = safeReturnPath(requested);
  if (role === 'admin') return path?.startsWith('/admin') ? path : '/admin';
  return path ?? '/';
}

/** Đường dẫn tới trang đăng nhập/đăng ký kèm `?next=` để tải lại trang vẫn nhớ nơi cần quay về. */
export function authHref(page: '/login' | '/register', from: string | null | undefined) {
  const path = safeReturnPath(from ?? undefined);
  return path ? `${page}?next=${encodeURIComponent(path)}` : page;
}

export const loginHref = (from: string | null | undefined) => authHref('/login', from);

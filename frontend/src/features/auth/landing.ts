/** Chỉ quay lại đường dẫn nội bộ của ứng dụng; chặn chuyển hướng sang trang ngoài. */
export function safeReturnPath(path: string | undefined) {
  // "//host" và "/\host" bị trình duyệt hiểu là trang ngoài.
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\'))
    return null;
  return /^\/(login|register|forgot-password|reset-password|oauth-callback)(\/|\?|#|$)/.test(path)
    ? null
    : path;
}

export function landingPath(role: string, requested: string | undefined) {
  const path = safeReturnPath(requested);
  if (role === 'admin') return path?.startsWith('/admin') ? path : '/admin';
  return path ?? '/';
}

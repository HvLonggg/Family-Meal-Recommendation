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

/**
 * Sau khi đăng nhập: quay lại trang đã yêu cầu (nếu hợp lệ), còn không thì về trang chủ.
 * Quản trị viên cũng về trang chủ; khu quản trị mở từ menu tài khoản.
 */
export function landingPath(requested: string | null | undefined) {
  return safeReturnPath(requested ?? undefined) ?? '/';
}

const OAUTH_RETURN_KEY = 'bepviet.oauth-return-path';

/** Đăng nhập mạng xã hội rời khỏi ứng dụng, nên ghi nhớ nơi cần quay về trong phiên tab. */
export function rememberOAuthReturnPath(path: string | null | undefined) {
  try {
    const safePath = safeReturnPath(path ?? undefined);
    if (safePath) sessionStorage.setItem(OAUTH_RETURN_KEY, safePath);
    else sessionStorage.removeItem(OAUTH_RETURN_KEY);
  } catch {
    // Trình duyệt chặn bộ nhớ thì vẫn đăng nhập được, chỉ về trang chủ.
  }
}

export function consumeOAuthReturnPath() {
  try {
    const path = sessionStorage.getItem(OAUTH_RETURN_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_KEY);
    return safeReturnPath(path ?? undefined);
  } catch {
    return null;
  }
}

/** Đường dẫn tới trang đăng nhập/đăng ký kèm `?next=` để tải lại trang vẫn nhớ nơi cần quay về. */
export function authHref(page: '/login' | '/register', from: string | null | undefined) {
  const path = safeReturnPath(from ?? undefined);
  return path ? `${page}?next=${encodeURIComponent(path)}` : page;
}

export const loginHref = (from: string | null | undefined) => authHref('/login', from);

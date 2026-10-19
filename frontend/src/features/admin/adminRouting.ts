/** Giới hạn khu vực quản trị; chỉ cho phép xem trước món và bài viết công khai. */

const PREVIEW_PATHS = [/^\/recipes\/[^/]+\/?$/, /^\/articles\/[^/]+\/?$/];

const ADMIN_EQUIVALENTS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^\/stories\/new\/?$/, () => '/admin/articles/new'],
  [/^\/stories\/([^/]+)\/edit\/?$/, (match) => `/admin/articles/${match[1]}/edit`],
  [/^\/account\/settings\/?$/, () => '/admin/settings'],
  [/^\/account\/security\/?$/, () => '/admin/security'],
  [/^\/account\/stories\/?$/, () => '/admin/articles'],
  [/^\/(account\/submissions|submit-recipe)\/?$/, () => '/admin/submissions'],
  [/^\/articles\/?$/, () => '/admin/articles'],
  [/^\/recipes\/?$/, () => '/admin/recipes'],
  [/^\/planner\/?$/, () => '/admin/plans'],
  [/^\/contact\/?$/, () => '/admin/support'],
];

export function isAdminPreviewPath(pathname: string) {
  return PREVIEW_PATHS.some((pattern) => pattern.test(pathname));
}

/** Trả về đường dẫn quản trị tương ứng, hoặc `null` nếu được xem trước. */
export function adminDestinationFor(pathname: string) {
  if (isAdminPreviewPath(pathname)) return null;
  for (const [pattern, destination] of ADMIN_EQUIVALENTS) {
    const match = pathname.match(pattern);
    if (match) return destination(match);
  }
  return '/admin';
}

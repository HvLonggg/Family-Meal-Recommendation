export const legacyRoutes: Record<string, string> = {
  'mon-an': 'recipes',
  'bua-com': 'meals',
  'mam-com-ngau-nhien': 'random-meal',
  'ke-hoach': 'planner',
  'goi-y': 'suggestions',
  'dinh-duong': 'nutrition',
  'bai-viet': 'articles',
  'yeu-thich': 'favorites',
  'de-xuat-mon': 'submit-recipe',
  'tai-khoan': 'account',
  'quan-tri': 'admin',
  'lien-he': 'contact',
  'cai-dat': 'account/settings',
  'dang-nhap': 'login',
  'dang-ky': 'register',
  'quen-mat-khau': 'forgot-password',
  'dat-lai-mat-khau': 'reset-password',
  'xac-thuc-google': 'oauth-callback',
};

export function canonicalPath(pathname: string) {
  const [prefix = '', ...rest] = pathname.slice(1).split('/');
  return `/${[legacyRoutes[prefix] ?? prefix, ...rest].join('/')}`;
}

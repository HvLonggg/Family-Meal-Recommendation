import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { updateInProgress } from '@/features/pwa/updateState';
import { loadRecipeCatalog } from '@/data/recipeApi';
import { applyRecipeLanguage } from '@/features/i18n/recipeContent';
import { LANGUAGE_STORAGE_KEY, readStoredLanguage, translate } from '@/features/i18n/translate';
import '@/styles/global.css';
import '@/styles/auth.css';
import '@/styles/product.css';
import '@/styles/workspace.css';
import '@/styles/admin.css';
import '@/styles/community.css';
import '@/styles/assistant.css';
import '@/styles/cooking.css';

// Tab cũ mở lâu có thể đòi tệp JS của bản đã bị thay: tải lại một lần để nhận bản mới.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'bep-viet.preload-reloaded';
  try {
    if (sessionStorage.getItem(key) === __APP_BUILD__) return;
    sessionStorage.setItem(key, __APP_BUILD__);
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// Hạn chế lưu ảnh thuộc Bếp Việt (món ăn, ảnh đại diện, logo): chặn menu chuột phải và kéo thả ảnh.
// Ô xem trước của trang quản trị được giữ nguyên để người biên tập kiểm tra ảnh tải lên.
const protectImage = (event: Event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement && !target.closest('[data-allow-image-save]')) {
    event.preventDefault();
  }
};
document.addEventListener('contextmenu', protectImage);
document.addEventListener('dragstart', protectImage);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.');
}

const root = createRoot(rootElement);
const language = readStoredLanguage();
const t = (text: string) => translate(language, text);
document.documentElement.lang = language;

const resumingUpdate = updateInProgress();
let loadingProgress = resumingUpdate ? 65 : 0;
function renderCatalogLoader(progress: number) {
  if (resumingUpdate) progress = 65 + progress * 0.35;
  loadingProgress = Math.max(loadingProgress, Math.min(100, progress));
  root.render(
    <main className="catalog-loading" role="status" aria-label={t('Bếp Việt đang tải')}>
      <img className="catalog-loading__logo" src="/images/brand/bep-viet-logo.png" alt="Bếp Việt" />
      <div
        className="catalog-loading__track"
        role="progressbar"
        aria-label={t('Tiến độ tải ứng dụng')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(loadingProgress)}
      >
        <span
          className={`catalog-loading__fill${loadingProgress === 100 ? ' is-complete' : ''}`}
          style={{ width: `${loadingProgress}%` }}
        />
      </div>
    </main>,
  );
}

// Trang pháp lý không cần kho món: hiện ngay, không bắt người dùng chờ tải danh mục.
// Trang đăng nhập/đăng ký cũng vậy: khách thấy form ngay, kho món tải ở nền.
const LEGAL_PATH =
  /^\/(privacy|terms|login|register|forgot-password|reset-password|oauth-callback)\/?$/;

if (LEGAL_PATH.test(window.location.pathname) && !resumingUpdate) {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Vẫn nạp kho món ở nền để các trang khác dùng được khi người dùng chuyển trang.
  void loadRecipeCatalog(() => undefined).catch(() => undefined);
  void applyRecipeLanguage(language);
} else {
  renderCatalogLoader(6);
  void startApp();
}

async function startApp() {
  let catalogUnavailable = false;
  let offlineCatalog = false;
  // Tải bản dịch song song với danh mục món.
  const recipeLanguage = applyRecipeLanguage(readStoredLanguage());
  try {
    offlineCatalog = (await loadRecipeCatalog(renderCatalogLoader)) === 'offline';
  } catch {
    catalogUnavailable = true;
  }
  const recipeLanguageReady = await recipeLanguage;
  if (!recipeLanguageReady && language === 'en') {
    // Dùng tiếng Việt nếu không tải được bản dịch.
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'vi');
    } catch {
      // Bộ nhớ trình duyệt có thể không truy cập được.
    }
    document.documentElement.lang = 'vi';
  }
  await document.fonts.ready.catch(() => undefined);
  renderCatalogLoader(100);
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  root.render(
    <StrictMode>
      {(catalogUnavailable || offlineCatalog) && (
        <div className="catalog-unavailable" role="status">
          {offlineCatalog
            ? t('Kho món tải chậm, đang tạm dùng bản lưu sẵn.')
            : t('Chưa kết nối được kho món. Đang hiển thị các công thức có sẵn.')}{' '}
          <button onClick={() => window.location.reload()} type="button">
            {t('Thử lại')}
          </button>
        </div>
      )}
      <App />
    </StrictMode>,
  );
}

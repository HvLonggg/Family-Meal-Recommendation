import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { startInstallCapture } from '@/features/pwa/installPrompt';
import { updateInProgress } from '@/features/pwa/updateState';
import { CatalogStatusNotice } from '@/components/recipes/CatalogGate';
import { startRecipeCatalog } from '@/data/recipeApi';
import { loadEnglishSearchIndex } from '@/data/recipeSearch';
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
import '@/styles/mobile-home-search.css';
import '@/styles/mobile-pages.css';

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

// Bắt lời mời cài ứng dụng ngay từ đầu (trình duyệt có thể phát trước khi React dựng xong).
startInstallCapture();

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

// Bắt đầu nạp kho món ngay, trước lần render đầu: có bản lưu ở máy thì dùng liền rồi làm mới ở nền.
// Khung trang (header, hero, điều hướng) hiện ngay; phần cần kho món hiện khung giữ chỗ tới khi có dữ liệu.
const catalogReady = startRecipeCatalog(resumingUpdate ? renderCatalogLoader : undefined);
const recipeLanguage = applyRecipeLanguage(language);

// Chỉ mục tìm kiếm tiếng Anh không cần cho lần vẽ đầu: tải khi trình duyệt rảnh sau khi kho món
// đã sẵn sàng, để không tranh băng thông với kho món.
function prefetchSearchIndexWhenIdle() {
  const load = () => void loadEnglishSearchIndex();
  if (typeof window.requestIdleCallback === 'function')
    window.requestIdleCallback(load, { timeout: 5000 });
  else window.setTimeout(load, 2000);
}

function renderApp() {
  root.render(
    <StrictMode>
      <CatalogStatusNotice />
      <App />
    </StrictMode>,
  );
  void catalogReady.then(prefetchSearchIndexWhenIdle);
}

async function waitForLanguage() {
  if ((await recipeLanguage) || language !== 'en') return;
  // Dùng tiếng Việt nếu không tải được bản dịch.
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'vi');
  } catch {
    // Bộ nhớ trình duyệt có thể không truy cập được.
  }
  document.documentElement.lang = 'vi';
}

if (resumingUpdate) {
  // Vừa bấm "Cập nhật": nối tiếp thanh tiến độ của hộp thoại cập nhật tới khi kho món sẵn sàng.
  renderCatalogLoader(6);
  void (async () => {
    await Promise.all([catalogReady, waitForLanguage()]);
    renderCatalogLoader(100);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    renderApp();
  })();
} else {
  // Tiếng Việt hiện ngay; tiếng Anh chờ bản dịch để không nháy nội dung tiếng Việt.
  void waitForLanguage().then(renderApp);
}

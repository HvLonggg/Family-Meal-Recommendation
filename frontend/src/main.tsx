import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { loadRecipeCatalog } from '@/data/recipeApi';
import { readStoredLanguage, translate } from '@/features/i18n/translate';
import '@/styles/global.css';
import '@/styles/auth.css';
import '@/styles/product.css';
import '@/styles/workspace.css';
import '@/styles/admin.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.');
}

const root = createRoot(rootElement);
const language = readStoredLanguage();
const t = (text: string) => translate(language, text);
document.documentElement.lang = language;

let loadingProgress = 0;
function renderCatalogLoader(progress: number) {
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

renderCatalogLoader(6);

async function startApp() {
  let catalogUnavailable = false;
  let offlineCatalog = false;
  try {
    offlineCatalog = (await loadRecipeCatalog(renderCatalogLoader)) === 'offline';
  } catch {
    catalogUnavailable = true;
  }
  await document.fonts.ready.catch(() => undefined);
  renderCatalogLoader(100);
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  root.render(
    <StrictMode>
      {(catalogUnavailable || offlineCatalog) && (
        <div className="catalog-unavailable" role="status">
          {offlineCatalog
            ? t('Đang dùng bản kho món có sẵn. Máy chủ hiện chưa kết nối.')
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

void startApp();

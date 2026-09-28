import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import '@/styles/global.css';
import '@/styles/auth.css';
import '@/styles/product.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

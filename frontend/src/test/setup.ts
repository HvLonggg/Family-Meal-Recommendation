import '@testing-library/jest-dom/vitest';

import { setRecipeCatalogSource } from '@/data/recipes';
import { loadEnglishSearchIndex } from '@/data/recipeSearch';
import { loadEnglishUiMessages } from '@/features/i18n/translate';

// Ứng dụng tải chỉ mục tìm kiếm tiếng Anh ở nền; test cần sẵn dữ liệu như lúc đã tải xong.
await loadEnglishSearchIndex();
await loadEnglishUiMessages();

// Trong test, kho món (dữ liệu đóng gói sẵn hoặc do test nạp) coi như đã sẵn sàng;
// test nào kiểm tra trạng thái đang tải thì tự đặt lại nguồn 'loading'.
setRecipeCatalogSource('online');

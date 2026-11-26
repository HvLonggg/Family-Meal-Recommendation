import '@testing-library/jest-dom/vitest';

import { loadEnglishSearchIndex } from '@/data/recipeSearch';
import { loadEnglishUiMessages } from '@/features/i18n/translate';

// Ứng dụng tải chỉ mục tìm kiếm tiếng Anh ở nền; test cần sẵn dữ liệu như lúc đã tải xong.
await loadEnglishSearchIndex();
await loadEnglishUiMessages();

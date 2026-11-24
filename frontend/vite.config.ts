import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

// Mã phiên bản riêng cho mỗi lần build: đổi nội dung sw.js để trình duyệt nhận bản mới,
// và ghi version.json để tab đang mở biết đã có phiên bản mới.
const buildId = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 14);

function appVersionPlugin(): Plugin {
  return {
    name: 'bep-viet-app-version',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(currentDirectory, 'dist');
      const workerPath = path.join(outDir, 'sw.js');
      if (existsSync(workerPath)) {
        const worker = readFileSync(workerPath, 'utf8').replaceAll('__BUILD_ID__', buildId);
        writeFileSync(workerPath, worker);
      }
      writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ build: buildId }));
    },
  };
}

export default defineConfig(({ mode }) => {
  const { VITE_API_PROXY_TARGET: apiProxyTarget = 'http://127.0.0.1:8000' } = loadEnv(
    mode,
    currentDirectory,
    'VITE_',
  );

  return {
    plugins: [react(), tailwindcss(), appVersionPlugin()],
    define: {
      __APP_BUILD__: JSON.stringify(mode === 'test' ? 'test' : buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(currentDirectory, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Các test giao diện tích hợp (planner, kho món) chạy song song có thể quá 5 giây trên Windows.
      testTimeout: 15_000,
      css: true,
    },
  };
});

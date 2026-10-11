import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const { VITE_API_PROXY_TARGET: apiProxyTarget = 'http://127.0.0.1:8000' } = loadEnv(
    mode,
    currentDirectory,
    'VITE_',
  );

  return {
    plugins: [react(), tailwindcss()],
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

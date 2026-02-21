import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const tsconfigRaw = {
  compilerOptions: {
    baseUrl: '.',
    jsx: 'react-jsx' as const,
    paths: {
      '@/*': ['./src/*'],
    },
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  esbuild: {
    tsconfigRaw,
  },
  optimizeDeps: {
    esbuildOptions: {
      tsconfigRaw,
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});

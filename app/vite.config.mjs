import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const tsconfigRaw = {
  compilerOptions: {
    baseUrl: '.',
    jsx: 'react-jsx',
    paths: {
      '@/*': ['./src/*'],
    },
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  esbuild: {
    tsconfigRaw,
    // Strip console.* and debugger statements from production builds
    // to avoid leaking API structure / error details to end users.
    ...(mode === 'production' ? { drop: ['console', 'debugger'] } : {}),
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
}));

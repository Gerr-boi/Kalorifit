import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['kalorifit/**', 'dist/**'],
  },
});

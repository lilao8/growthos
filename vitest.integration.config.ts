import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests: repository adapters against real storage backends.
 * jsdom supplies a real localStorage implementation for the browser adapter.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'integration',
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.ts'],
    globals: false,
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests: pure domain functions only. No DOM, no storage adapters.
 * Integration tests live in a separate project config (vitest.integration.config.ts)
 * so that the two boundaries stay independently runnable per the test script contract.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});

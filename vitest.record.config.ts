import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Records agent replays: `npm run agent:record`. Not part of any test run or
 * gate. Reads .env.local the way Next.js does, so the same OPENAI_API_KEY,
 * AGENT_MODEL_PROVIDER and AGENT_MODEL drive the recording; the key is used
 * only for the model request and is never written to the replay.
 */
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'record',
    environment: 'node',
    include: ['scripts/**/*.record.ts'],
    testTimeout: 600_000,
    env: loadEnv(mode, process.cwd(), ''),
  },
}));

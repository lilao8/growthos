// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ModelClient } from '@/services/agent/model';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import { DEFAULT_SCOPE } from '@/domain/agent/scope';

/**
 * Cancelling the response stream must reach the model: a reader that goes
 * away stops the turn, rather than leaving a model call running for nobody.
 */

const seen: { aborted: boolean | null } = { aborted: null };
let release: () => void = () => {};

vi.mock('@/services/agent/live-config', () => ({
  resolveLiveModel: (): { ok: true; model: ModelClient } => ({
    ok: true,
    model: {
      id: 'scripted:hold',
      next: (_request, signal) =>
        new Promise((resolve) => {
          // Holds until the turn is cancelled, then records what it saw.
          signal.addEventListener('abort', () => {
            seen.aborted = signal.aborted;
            release();
            resolve({ type: 'final', content: '{}' });
          });
        }),
    },
  }),
}));

describe('response stream cancellation', () => {
  it('aborts the model call when the reader cancels the stream', async () => {
    const { POST } = await import('@/app/api/agent/route');
    const response = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'q', history: [], scope: DEFAULT_SCOPE, state: buildDemoSeedState() }),
      }),
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"type":"started"');

    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await reader.cancel();
    await released;
    expect(seen.aborted).toBe(true);
  });
});

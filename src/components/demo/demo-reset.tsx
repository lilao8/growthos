'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { formatInteger } from '@/domain/format';
import {
  previewDemoReset,
  resetDemoData,
  type DemoResetPreview,
} from '@/services/demo-state-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

/**
 * Demo reset.
 *
 * The storage contract says stored data is cleared only by an explicit user
 * action — never on a schema mismatch, a corrupted read or a page load. This is
 * the one place that action exists, and it is deliberately two-step: the
 * confirmation names what is about to be discarded rather than asking "are you
 * sure?" about an unspecified amount of work.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'idle'; preview: DemoResetPreview }
  | { kind: 'confirming'; preview: DemoResetPreview }
  | { kind: 'working'; preview: DemoResetPreview }
  | { kind: 'done' }
  | { kind: 'error'; message: string; preview: DemoResetPreview | null };

function Lines({ preview }: { preview: DemoResetPreview }) {
  const rows: Array<[string, number]> = [
    ['Products with edited SEO metadata', preview.editedProducts],
    ['Content ideas you added or changed', preview.contentIdeas],
    ['Stored audit results', preview.auditResults],
    ['Recommendations marked done', preview.completedRecommendations],
  ];

  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid="reset-preview">
      {rows.map(([label, count]) => (
        <li key={label} className="flex justify-between gap-4">
          <span className="text-[var(--color-ink-muted)]">{label}</span>
          <span className="font-medium tabular-nums">
            {formatInteger(count)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DemoReset({ mode }: { mode: DemoDataMode | null }) {
  const repository = useMemo(() => resolveStateRepository(mode), [mode]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void previewDemoReset(repository).then((result) => {
      if (cancelled) return;
      setPhase(
        result.status === 'ready'
          ? { kind: 'idle', preview: result.preview }
          : { kind: 'error', message: result.message, preview: null },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const confirm = useCallback(async () => {
    setPhase((current) =>
      current.kind === 'confirming'
        ? { kind: 'working', preview: current.preview }
        : current,
    );
    const result = await resetDemoData(repository);
    setPhase((current) =>
      result.status === 'reset'
        ? { kind: 'done' }
        : {
            kind: 'error',
            message: result.message,
            preview: current.kind === 'working' ? current.preview : null,
          },
    );
  }, [repository]);

  return (
    <Card>
      <CardHeader
        title="Demo data"
        description="Everything you change in this workbench is stored in this browser only. Nothing is sent anywhere."
      />
      <CardBody className="flex flex-col gap-4">
        <p className="max-w-2xl text-sm text-[var(--color-ink-muted)]">
          Product SEO edits, content ideas, audit results and completed
          recommendations are kept under a namespaced key in this browser&apos;s
          local storage. Traffic, orders and spend are not stored — they are
          generated from a fixed seed and are identical on every load. Resetting
          clears only this project&apos;s key and returns the catalogue and
          content plan to their original state.
        </p>

        {phase.kind === 'loading' && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm"
            data-testid="reset-loading"
          >
            Checking what is stored…
          </p>
        )}

        {phase.kind === 'error' && (
          <div role="alert" data-testid="reset-error">
            <p className="text-sm font-medium">Demo data could not be reset</p>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              {phase.message} Nothing was cleared, so your work is still here.
            </p>
          </div>
        )}

        {phase.kind === 'done' && (
          <div role="status" aria-live="polite" data-testid="reset-done">
            <p className="text-sm font-medium">Demo data reset.</p>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">
              Stored edits, audits and completions have been cleared. Reload to
              see the workbench in its original state.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              data-testid="reset-reload"
              className="mt-3 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Reload the workbench
            </button>
          </div>
        )}

        {(phase.kind === 'idle' ||
          phase.kind === 'confirming' ||
          phase.kind === 'working') && (
          <>
            {phase.preview.corrupted && (
              <p className="text-sm" data-testid="reset-corrupted">
                <strong>Stored data could not be read.</strong> The workbench is
                currently showing seed data. Resetting clears the unreadable
                entry — there is nothing of yours to lose.
              </p>
            )}

            {phase.preview.alreadyClean && !phase.preview.corrupted ? (
              <p className="text-sm" data-testid="reset-clean">
                Nothing is stored yet. The workbench is already showing its
                original demo data.
              </p>
            ) : (
              <Lines preview={phase.preview} />
            )}

            {phase.kind === 'idle' ? (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setPhase({ kind: 'confirming', preview: phase.preview })
                  }
                  data-testid="reset-start"
                  className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                >
                  Reset demo data
                </button>
              </div>
            ) : (
              <div
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3"
                data-testid="reset-confirm-panel"
              >
                <p className="text-sm font-medium">
                  Reset the demo data listed above?
                </p>
                <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">
                  This cannot be undone. Only this project&apos;s storage key is
                  touched; other sites and other data in this browser are not
                  affected.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void confirm()}
                    disabled={phase.kind === 'working'}
                    data-testid="reset-confirm"
                    className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
                  >
                    {phase.kind === 'working'
                      ? 'Resetting…'
                      : 'Yes, reset demo data'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPhase({ kind: 'idle', preview: phase.preview })
                    }
                    disabled={phase.kind === 'working'}
                    data-testid="reset-cancel"
                    className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
                  >
                    Keep my data
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

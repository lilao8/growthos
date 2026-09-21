import type { ReactNode } from 'react';

/**
 * Loading / empty / error presentation.
 *
 * Status is never carried by colour alone: each block has a visible text label
 * and an appropriate ARIA role, so the state is announced to a screen reader and
 * readable without colour perception.
 */

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-8 text-center">
      {children}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <Frame>
      <div role="status" aria-live="polite" data-testid="state-loading">
        <span className="text-sm font-medium">Loading…</span>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{label}</p>
      </div>
      <div aria-hidden="true" className="mx-auto mt-4 max-w-md space-y-2">
        <div className="h-3 animate-pulse rounded bg-[var(--color-surface-muted)]" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--color-surface-muted)]" />
      </div>
    </Frame>
  );
}

export function EmptyBlock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Frame>
      <div data-testid="state-empty">
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-[var(--color-ink-muted)]">
          {description}
        </p>
      </div>
    </Frame>
  );
}

export function ErrorBlock({
  title,
  message,
  onRetry,
  retrying = false,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Frame>
      <div role="alert" data-testid="state-error">
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-[var(--color-ink-muted)]">
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        data-testid="retry-button"
        className="mt-4 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </Frame>
  );
}

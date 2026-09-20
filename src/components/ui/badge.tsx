import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'muted' | 'accent';

const TONES: Record<BadgeTone, string> = {
  neutral:
    'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]',
  muted:
    'border-[var(--color-line)] bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]',
  accent: 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white',
};

/**
 * Status is always carried by the label text, never by colour alone, so the
 * badge stays readable without colour perception.
 */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

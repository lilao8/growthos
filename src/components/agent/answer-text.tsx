import Link from 'next/link';
import type { Route } from 'next';
import type { Segment } from '@/domain/agent/answer-render';

/** Renders answer text: plain runs as text, every figure as a link to its source page. */
export function AnswerText({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <Link
            key={index}
            href={segment.href as Route}
            title={segment.kind === 'audit' ? 'Open the audit evidence' : segment.label}
            data-testid="agent-figure"
            data-ref={segment.refId}
            className="font-medium tabular-nums underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            {segment.text}
          </Link>
        ),
      )}
    </>
  );
}

export function plainText(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

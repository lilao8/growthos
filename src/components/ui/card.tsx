import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /**
   * Usually a readiness sentinel. A card that renders only once its data has
   * resolved is proof the component hydrated and the effect finished, which
   * the server-rendered markup around it cannot show. Named `testId` to match
   * MetricCard rather than adding a second spelling.
   */
  testId?: string;
}

export function Card({ children, className = '', testId }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] ${className}`}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  /** Rendered as the accessible heading; keeps one h2 per card section. */
  id?: string;
  description?: string;
  children?: ReactNode;
}

export function CardHeader({
  title,
  id,
  description,
  children,
}: CardHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
      <div>
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {description !== undefined && (
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: CardProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

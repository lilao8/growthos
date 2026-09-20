import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] ${className}`}
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

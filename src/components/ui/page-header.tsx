import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}

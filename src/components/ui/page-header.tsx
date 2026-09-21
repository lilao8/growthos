import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    // A plain <div>, not a <header>. Inside <main> a <header> is exposed as a
    // second `banner` landmark in Chromium, so a screen reader's landmark list
    // shows two banners and neither name tells them apart. The <h1> below
    // already identifies the page, which is what the element would have been
    // for.
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

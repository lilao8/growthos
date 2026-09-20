import type { ReactNode } from 'react';

/**
 * Table primitives. The wrapper scrolls horizontally on narrow screens so a wide
 * table never pushes the page itself sideways.
 */

export function TableWrapper({ children }: { children: ReactNode }) {
  return <div className="w-full overflow-x-auto">{children}</div>;
}

export function Table({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: string;
}) {
  return (
    <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
      {caption !== undefined && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-[var(--color-line)] text-xs tracking-wide text-[var(--color-ink-muted)] uppercase">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-[var(--color-line)]">{children}</tbody>
  );
}

export function TR({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function TH({
  children,
  scope = 'col',
}: {
  children: ReactNode;
  scope?: 'col' | 'row';
}) {
  return (
    <th scope={scope} className="px-4 py-2 font-medium">
      {children}
    </th>
  );
}

export function TD({
  children,
  numeric = false,
}: {
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <td className={`px-4 py-2 ${numeric ? 'tabular-nums' : ''}`}>{children}</td>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { NAV_ITEMS, SECONDARY_NAV_ITEMS, type NavItem } from './nav-items';
import { DEMO_WINDOW } from '@/domain/demo-window';
import { formatDateRange } from '@/domain/format';
import { DEMO_BRAND } from '@/fixtures/demo-seed';

/**
 * Application shell: header, sidebar navigation and the main content region.
 *
 * Desktop-first. Below the `lg` breakpoint the sidebar becomes a disclosure
 * panel driven by a real button — it is reachable by keyboard, reports its state
 * through aria-expanded, and closes on Escape or on navigation.
 */

function NavList({
  items = NAV_ITEMS,
  onNavigate,
}: {
  items?: readonly NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => onNavigate?.()}
              aria-current={active ? 'page' : undefined}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                active
                  ? 'bg-[var(--color-accent)] font-semibold text-white'
                  : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              <span>{item.label}</span>
              {!item.implemented && (
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]'
                  }`}
                >
                  Soon
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  // The panel is closed by the link's own onNavigate handler rather than by an
  // effect watching the pathname: closing is a consequence of the click, not of
  // the route settling, and syncing state in an effect would cascade renders.

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-[var(--color-surface)] focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to main content
      </a>

      <aside className="hidden border-r border-[var(--color-line)] bg-[var(--color-surface)] lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 px-4 py-5">
          <div>
            <p className="text-base font-semibold tracking-tight">GrowthOS</p>
            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
              {DEMO_BRAND}
            </p>
          </div>
          <nav aria-label="Main" className="flex-1">
            <NavList />
          </nav>
          <nav aria-label="About" className="border-t border-[var(--color-line)] pt-3">
            <NavList items={SECONDARY_NAV_ITEMS} />
          </nav>
          <p className="text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
            Demo data only. SEO and GEO scores are internal heuristics, not any
            search engine&apos;s ranking algorithm.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-controls={menuId}
                data-testid="menu-toggle"
                className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] lg:hidden"
              >
                Menu
              </button>
              <span className="truncate text-sm font-semibold lg:hidden">
                GrowthOS
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="hidden text-xs text-[var(--color-ink-muted)] sm:inline"
                data-testid="header-window"
              >
                {formatDateRange(DEMO_WINDOW.start, DEMO_WINDOW.end)} · UTC
              </span>
              <span
                className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] font-medium tracking-wide text-[var(--color-ink-muted)] uppercase"
                data-testid="demo-data-badge"
              >
                Demo data
              </span>
            </div>
          </div>

          {menuOpen && (
            <nav
              id={menuId}
              aria-label="Main"
              data-testid="mobile-nav"
              className="border-t border-[var(--color-line)] px-4 py-3 lg:hidden"
            >
              <NavList onNavigate={() => setMenuOpen(false)} />
              <div className="mt-2 border-t border-[var(--color-line)] pt-2">
                <NavList
                  items={SECONDARY_NAV_ITEMS}
                  onNavigate={() => setMenuOpen(false)}
                />
              </div>
            </nav>
          )}
        </header>

        <main
          id="main-content"
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

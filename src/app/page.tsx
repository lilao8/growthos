import { getDemoStatus } from '@/services/demo-state-service';
import { DEMO_BRAND, DEMO_MARKET } from '@/fixtures/demo-seed';

/**
 * Dispatch 0 start page.
 *
 * Intentionally not a dashboard: it proves the app boots, that the layering
 * (page -> service -> repository -> fixture) is wired, and it states the demo
 * data window honestly. Metric cards, navigation and module screens arrive in
 * Dispatch 1 and later.
 */

const MODULES = [
  { name: 'Dashboard', route: '/dashboard', dispatch: 'Dispatch 1' },
  { name: 'Products', route: '/products', dispatch: 'Dispatch 2' },
  { name: 'SEO Audit', route: '/seo', dispatch: 'Dispatch 3' },
  { name: 'GEO Audit', route: '/geo', dispatch: 'Dispatch 4' },
  { name: 'Content Planner', route: '/content', dispatch: 'Dispatch 5' },
  { name: 'Analytics', route: '/analytics', dispatch: 'Dispatch 6' },
  { name: 'Conversion Funnel', route: '/funnel', dispatch: 'Dispatch 7' },
  { name: 'Recommendations', route: '/recommendations', dispatch: 'Dispatch 8' },
] as const;

export default async function StartPage() {
  const status = await getDemoStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <p
          className="w-fit rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase"
          data-testid="demo-data-badge"
        >
          Demo data — fictional brand
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">GrowthOS</h1>
        <p className="text-[var(--color-ink-muted)]">
          A DTC growth decision workbench for {DEMO_BRAND} ({DEMO_MARKET}, USD).
          SEO, GEO, content, analytics and conversion analysis over one shared,
          reproducible data set.
        </p>
      </header>

      <section
        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
        aria-labelledby="foundation-heading"
      >
        <h2 id="foundation-heading" className="text-sm font-semibold">
          Dispatch 0 — foundation
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-[var(--color-ink-muted)]">Reporting window</dt>
            <dd data-testid="demo-window" className="font-medium">
              {status.windowStart} to {status.windowEnd} ({status.windowDays}{' '}
              days, UTC)
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-[var(--color-ink-muted)]">Seed fixture</dt>
            <dd className="font-medium">
              {status.productCount} products, {status.snapshotCount} page
              snapshots
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-[var(--color-ink-muted)]">
          The window ends on a fixed date. This is seeded demo data, not live
          traffic, and it is identical on every reload.
        </p>
      </section>

      <section aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="text-sm font-semibold">
          Modules
        </h2>
        <ul className="mt-4 divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
          {MODULES.map((module) => (
            <li
              key={module.route}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
            >
              <span className="font-medium">{module.name}</span>
              <span className="text-[var(--color-ink-muted)]">
                Not implemented yet — planned for {module.dispatch}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-xs text-[var(--color-ink-muted)]">
        SEO and GEO scores in this project are internal heuristics. They are not
        any search engine&apos;s ranking algorithm and do not predict rankings or
        AI citations.
      </footer>
    </main>
  );
}

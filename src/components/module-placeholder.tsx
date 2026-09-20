import { PageHeader } from './ui/page-header';
import { Card, CardBody } from './ui/card';
import type { NavItem } from './layout/nav-items';

/**
 * Placeholder for a route whose module has not been built yet. It states the
 * planned scope and the dispatch that will deliver it — no mock screens, no
 * fabricated numbers.
 */
export function ModulePlaceholder({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.label} description={item.purpose} />
      <Card>
        <CardBody>
          <p className="text-sm font-medium" data-testid="not-implemented">
            Not implemented yet — planned for {item.dispatch}.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">
            This project is built one dispatch at a time. Rather than showing a
            mock screen, the route stays empty until the module behind it works
            on real fixture data.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

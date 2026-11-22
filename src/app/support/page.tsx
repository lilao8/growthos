import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { TableWrapper, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DEMO_RANGE_DAYS } from '@/domain/demo-window';
import { formatDateRange } from '@/domain/format';
import { SUPPORT_CATEGORIES, UNMATCHED_SUPPORT_PRODUCT, supportCategory, supportCategoryLabel } from '@/domain/support-feedback';
import { firstParam, parseRangeParam, RANGE_PARAM } from '@/domain/url-params';
import {
  SUPPORT_CATALOGUE,
  SUPPORT_CATEGORY_PARAM,
  SUPPORT_DEFAULT_RANGE,
  SUPPORT_PRODUCT_PARAM,
  supportFeedback,
  supportFeedbackHref,
} from '@/services/support-feedback';

const selectClass = 'rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm';

export default async function SupportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseRangeParam(firstParam(params[RANGE_PARAM]), SUPPORT_DEFAULT_RANGE);
  const requestedProduct = firstParam(params[SUPPORT_PRODUCT_PARAM]);
  const productId = requestedProduct === UNMATCHED_SUPPORT_PRODUCT || SUPPORT_CATALOGUE.some(({ id }) => id === requestedProduct)
    ? requestedProduct
    : null;
  const category = supportCategory(firstParam(params[SUPPORT_CATEGORY_PARAM]));
  const report = supportFeedback(range, { productId, category });

  return (
    <>
      <PageHeader
        title="Support Feedback"
        description="Simulated support tickets. Counts show reported issues by SKU without an order-volume denominator."
      />
      <div className="flex flex-col gap-6" data-testid="support-ready">
        <form action="/support" method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter support tickets">
          <label className="flex flex-col gap-1 text-sm">
            Date range
            <select name={RANGE_PARAM} defaultValue={range} className={selectClass}>
              {DEMO_RANGE_DAYS.map((days) => <option key={days} value={days}>Last {days} days</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            SKU
            <select name={SUPPORT_PRODUCT_PARAM} defaultValue={productId ?? ''} className={`${selectClass} max-w-[min(22rem,80vw)]`}>
              <option value="">All SKUs</option>
              {SUPPORT_CATALOGUE.map(({ id, sku, title }) => <option key={id} value={id}>{sku} · {title}</option>)}
              <option value={UNMATCHED_SUPPORT_PRODUCT}>Unmatched SKU</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Issue category
            <select name={SUPPORT_CATEGORY_PARAM} defaultValue={category ?? ''} className={selectClass}>
              <option value="">All categories</option>
              {SUPPORT_CATEGORIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-medium">
            Apply filters
          </button>
        </form>
        <p className="text-sm" data-testid="support-count">
          {report.rows.length} {report.rows.length === 1 ? 'ticket' : 'tickets'} · {formatDateRange(report.window.start, report.window.end)}
        </p>
        {report.rows.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No simulated tickets match these filters.</p>
        ) : (
          <>
            {productId === null && (
              <section aria-labelledby="support-ranking-heading" className="flex flex-col gap-2">
                <h2 id="support-ranking-heading" className="text-lg font-semibold">Tickets by SKU</h2>
                {report.ranking.length === 0 && <p className="text-sm">No tickets matched a catalogue SKU.</p>}
                <ol className="space-y-1 text-sm" data-testid="support-ranking">
                  {report.ranking.map((row) => (
                    <li key={row.product.id}>
                      <Link className="underline underline-offset-2" href={supportFeedbackHref(range, { productId: row.product.id, category })}>
                        {row.product.sku} · {row.product.title} ({row.count})
                      </Link>
                      {row.categories.length > 0 && ` · ${row.categories.map(({ id, count }) => `${supportCategoryLabel(id)} (${count})`).join(', ')}`}
                    </li>
                  ))}
                </ol>
                {report.unmatched > 0 && (
                  <Link className="text-sm underline underline-offset-2" href={supportFeedbackHref(range, { productId: UNMATCHED_SUPPORT_PRODUCT, category })}>
                    Unmatched SKU ({report.unmatched})
                  </Link>
                )}
              </section>
            )}
            <section aria-labelledby="support-tickets-heading" className="flex flex-col gap-2">
              <h2 id="support-tickets-heading" className="text-lg font-semibold">Matching tickets</h2>
              <TableWrapper>
                <Table caption="Simulated support tickets matching the filters">
                  <THead><TR><TH>Ticket</TH><TH>Created</TH><TH>SKU</TH><TH>Issue category</TH><TH>Summary</TH></TR></THead>
                  <TBody>
                    {report.rows.map((ticket) => (
                      <TR key={ticket.id}>
                        <TD>{ticket.id}</TD>
                        <TD>{ticket.createdAt}</TD>
                        <TD>{ticket.product?.sku ?? 'Unmatched'}</TD>
                        <TD>{supportCategoryLabel(ticket.category)}</TD>
                        <TD>{ticket.summary}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            </section>
          </>
        )}
      </div>
    </>
  );
}

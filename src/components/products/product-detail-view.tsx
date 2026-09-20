'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import {
  ErrorBlock,
  LoadingBlock,
} from '@/components/ui/status-block';
import { PageHeader } from '@/components/ui/page-header';
import { SeoMetadataForm } from './seo-metadata-form';
import { formatCents } from '@/domain/money';
import {
  formatInteger,
  formatMoneyMetric,
  formatPercent,
  NOT_AVAILABLE,
} from '@/domain/format';
import { safeRatio } from '@/domain/metrics';
import {
  loadProductDetail,
  saveProductSeo,
  type ProductDetailState,
  type ProductServiceDeps,
  type SaveSeoResult,
} from '@/services/product-service';
import {
  resolveStateRepository,
  resolveTrafficRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';

const NOT_AUDITED = 'Not audited';

function DetailRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex justify-between gap-6 border-b border-[var(--color-line)] py-2 last:border-b-0">
      <dt className="text-sm text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="text-sm font-medium tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function ProductDetailView({
  productId,
  mode,
}: {
  productId: string;
  mode: DemoDataMode | null;
}) {
  const deps = useMemo<ProductServiceDeps>(
    () => ({
      state: resolveStateRepository(mode),
      traffic: resolveTrafficRepository(mode),
    }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProductDetailState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadProductDetail(deps, productId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, productId, attempt]);

  const handleSave = useCallback(
    async (input: {
      primaryKeyword: string;
      metaTitle: string;
      metaDescription: string;
    }): Promise<SaveSeoResult> => {
      const result = await saveProductSeo(deps, productId, input);
      if (result.status === 'saved') {
        // Re-read so the page reflects what is actually persisted, not what the
        // form believes it sent.
        setAttempt((value) => value + 1);
      }
      return result;
    },
    [deps, productId],
  );

  if (state === null) {
    return <LoadingBlock label="Loading this product." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load this product"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'not-found') {
    return (
      <>
        <PageHeader
          title="Product not found"
          description="No product in the demo catalogue has that ID or slug."
        />
        <Card>
          <CardBody>
            <p className="text-sm" data-testid="product-not-found">
              This product does not exist. It may have been removed, or the link
              may be wrong.
            </p>
            <Link
              href="/products"
              className="mt-4 inline-block rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Back to all products
            </Link>
          </CardBody>
        </Card>
      </>
    );
  }

  const { row, snapshot } = state;
  const { product, metrics, seoScore, geoScore } = row;
  const margin = safeRatio(
    product.priceCents - product.costCents,
    product.priceCents,
  );

  return (
    <>
      <PageHeader title={product.title} description={product.productDescription}>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={product.status === 'active' ? 'neutral' : 'muted'}>
            {product.status}
          </Badge>
          <Link
            href="/products"
            className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Back to all products
          </Link>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Product record" description="Stored fields." />
          <CardBody>
            <dl>
              <DetailRow label="SKU" value={product.sku} testId="detail-sku" />
              <DetailRow label="Slug" value={product.slug} />
              <DetailRow label="Category" value={product.category} />
              <DetailRow
                label="Price"
                value={formatCents(product.priceCents)}
                testId="detail-price"
              />
              <DetailRow label="Cost" value={formatCents(product.costCents)} />
              <DetailRow
                label="Gross margin"
                value={margin === null ? NOT_AVAILABLE : formatPercent(margin, 1)}
              />
              <DetailRow
                label="Inventory"
                value={formatInteger(product.inventory)}
              />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Derived metrics"
            description="Computed from demo traffic over the 90-day window. Not editable."
          />
          <CardBody>
            <dl>
              <DetailRow
                label="SEO score"
                value={
                  seoScore === null
                    ? NOT_AUDITED
                    : `${seoScore}${row.seoStale ? ' (stale)' : ''}`
                }
                testId="detail-seo-score"
              />
              <DetailRow
                label="GEO score"
                value={
                  geoScore === null
                    ? NOT_AUDITED
                    : `${geoScore}${row.geoStale ? ' (stale)' : ''}`
                }
                testId="detail-geo-score"
              />
              <DetailRow
                label="Sessions that viewed this product"
                value={formatInteger(metrics.viewSessions)}
                testId="detail-view-sessions"
              />
              <DetailRow
                label="Organic sessions"
                value={formatInteger(metrics.organicSessions)}
                testId="detail-organic-sessions"
              />
              <DetailRow
                label="Conversion rate"
                value={
                  metrics.conversionRate === null
                    ? NOT_AVAILABLE
                    : formatPercent(metrics.conversionRate)
                }
                testId="detail-conversion-rate"
              />
              <DetailRow
                label="Revenue"
                value={formatMoneyMetric(metrics.revenueCents)}
                testId="detail-revenue"
              />
              <DetailRow
                label="Units sold"
                value={formatInteger(metrics.unitsSold)}
              />
            </dl>
            <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
              Demo data. Conversion rate uses this product&apos;s own viewing
              sessions as the denominator, so product rates overlap and cannot be
              summed.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="SEO metadata"
          description="The fields an operator edits. Everything else on this page is derived."
        />
        <CardBody>
          <SeoMetadataForm
            key={product.id}
            product={product}
            onSave={handleSave}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Page snapshot"
          description="The audit input for this product. Captured content, not a live crawl."
        />
        <CardBody>
          {snapshot === null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              No page snapshot exists for this product, so it cannot be audited.
            </p>
          ) : (
            <dl>
              <DetailRow label="URL" value={snapshot.url} />
              <DetailRow
                label="Snapshot meta title"
                value={snapshot.metaTitle ?? 'Missing'}
                testId="snapshot-meta-title"
              />
              <DetailRow
                label="Snapshot meta description"
                value={snapshot.metaDescription ?? 'Missing'}
                testId="snapshot-meta-description"
              />
              <DetailRow label="H1" value={snapshot.h1 ?? 'Missing'} />
              <DetailRow
                label="Canonical"
                value={snapshot.canonical ?? 'Missing'}
              />
              <DetailRow
                label="Indexability"
                value={
                  snapshot.indexability === 'unknown'
                    ? 'Unknown — not captured'
                    : snapshot.indexability
                }
              />
              <DetailRow
                label="Internal links"
                value={formatInteger(snapshot.internalLinks.length)}
              />
              <DetailRow
                label="Structured data blocks"
                value={formatInteger(snapshot.structuredData.length)}
              />
            </dl>
          )}
          {snapshot !== null && (
            <p className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link
                href={`/seo/${snapshot.id}`}
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                data-testid="link-to-seo-audit"
              >
                {row.seoAudit === null
                  ? 'Run the SEO audit for this page'
                  : 'Open the SEO audit for this page'}
              </Link>
              <Link
                href={`/geo/${snapshot.id}`}
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                data-testid="link-to-geo-audit"
              >
                {row.geoAudit === null
                  ? 'Run the GEO audit for this page'
                  : 'Open the GEO audit for this page'}
              </Link>
            </p>
          )}
          <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
            {row.seoAudit === null
              ? 'No SEO audit has run against this snapshot yet.'
              : row.seoStale
                ? 'The snapshot changed after the last SEO audit, so the SEO score above is stale.'
                : `Last SEO audit: ${row.seoAudit.auditedAt} (${row.seoAudit.ruleVersion}).`}{' '}
            {row.geoAudit === null
              ? 'No GEO audit has run against it either.'
              : row.geoStale
                ? 'The GEO score is stale for the same reason.'
                : `Last GEO audit: ${row.geoAudit.auditedAt} (${row.geoAudit.ruleVersion}).`}
          </p>
        </CardBody>
      </Card>
    </>
  );
}

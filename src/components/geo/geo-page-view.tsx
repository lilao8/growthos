'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorBlock, LoadingBlock } from '@/components/ui/status-block';
import { formatPercent, NOT_AVAILABLE } from '@/domain/format';
import {
  GEO_MAX_POINTS_PER_RULE,
  GEO_RULE_IDS,
  GEO_RULE_META,
  type GeoRuleId,
} from '@/domain/geo-audit/config';
import {
  loadGeoPage,
  runGeoAuditForPage,
  type GeoAuditDeps,
  type GeoPageState,
} from '@/services/geo-audit-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { StatusBadge } from '@/components/seo/check-status';
import { GeoDisclaimer } from './geo-disclaimer';

function ruleMeta(ruleId: string): { title: string; signal: string } {
  const meta = GEO_RULE_META[ruleId as GeoRuleId];
  return meta === undefined
    ? { title: ruleId, signal: '' }
    : { title: meta.title, signal: meta.signal };
}

export function GeoPageView({
  pageId,
  mode,
}: {
  pageId: string;
  mode: DemoDataMode | null;
}) {
  const deps = useMemo<GeoAuditDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GeoPageState | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadGeoPage(deps, pageId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, pageId, attempt]);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setRunMessage('');
    const result = await runGeoAuditForPage(deps, pageId);
    setRunning(false);
    if (result.status === 'error') {
      setRunMessage(`${result.message} The previous result is unchanged.`);
      return;
    }
    setRunMessage('GEO audit complete.');
    setAttempt((value) => value + 1);
  }, [deps, pageId]);

  if (state === null) return <LoadingBlock label="Loading this GEO audit." />;

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load this audit"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'not-found') {
    return (
      <>
        <PageHeader
          title="Page not found"
          description="No page snapshot in the demo catalogue has that ID."
        />
        <Card>
          <CardBody>
            <p className="text-sm" data-testid="geo-page-not-found">
              This page does not exist in the catalogue.
            </p>
            <Link
              href="/geo"
              className="mt-4 inline-block rounded-md border border-[var(--color-line-strong)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Back to GEO overview
            </Link>
          </CardBody>
        </Card>
      </>
    );
  }

  const { snapshot, product, audit, tally, readiness } = state.row;
  const title = product?.title ?? snapshot.url;

  return (
    <>
      <PageHeader
        title={`GEO audit — ${title}`}
        description={`Content readiness of the stored snapshot for ${snapshot.url}`}
        testId="geo-page-ready"
      >
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void runAudit()}
            disabled={running}
            data-testid="run-geo-page-audit"
            className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
          >
            {running
              ? 'Running…'
              : audit === null
                ? 'Run GEO audit'
                : 'Re-run GEO audit'}
          </button>
          <div className="flex flex-wrap justify-end gap-3 text-sm">
            <Link
              href="/geo"
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              GEO overview
            </Link>
            <Link
              href={`/seo/${snapshot.id}`}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              data-testid="link-to-seo-page"
            >
              SEO audit
            </Link>
            {product !== null && (
              <Link
                href={`/products/${product.id}`}
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                data-testid="geo-link-to-product"
              >
                Edit this product
              </Link>
            )}
          </div>
        </div>
      </PageHeader>

      {runMessage !== '' && (
        <p role="status" data-testid="geo-run-message" className="text-sm">
          {runMessage}
        </p>
      )}

      {audit === null ? (
        <>
          <Card>
            <CardBody>
              <p className="text-sm" data-testid="geo-never-audited">
                This page has not been assessed yet, so it has no GEO score. Run
                the audit to see how it does against the {GEO_RULE_IDS.length}{' '}
                rules.
              </p>
            </CardBody>
          </Card>
          <GeoDisclaimer ruleVersion="geo-1.0.0" />
        </>
      ) : (
        <>
          {audit.stale && (
            <p
              role="status"
              data-testid="geo-stale-notice"
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm"
            >
              This page changed after the audit ran, so the result below
              describes the old content. Re-run it to refresh.
            </p>
          )}

          <Card>
            <CardHeader
              title="Result"
              description={`Rule set ${audit.ruleVersion} · audited ${audit.auditedAt}`}
            >
              <Badge tone={audit.stale ? 'muted' : 'neutral'}>
                {audit.stale ? 'Stale' : 'Current'}
              </Badge>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs tracking-wide text-[var(--color-ink-muted)] uppercase">
                    GEO score
                  </dt>
                  <dd
                    className="mt-1 text-2xl font-semibold tabular-nums"
                    data-testid="geo-page-score"
                  >
                    {audit.score ?? NOT_AVAILABLE}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-[var(--color-ink-muted)] uppercase">
                    AI readiness
                  </dt>
                  <dd
                    className="mt-1 text-2xl font-semibold"
                    data-testid="geo-page-readiness"
                  >
                    {readiness.label}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-[var(--color-ink-muted)] uppercase">
                    Coverage
                  </dt>
                  <dd
                    className="mt-1 text-2xl font-semibold tabular-nums"
                    data-testid="geo-page-coverage"
                  >
                    {formatPercent(audit.coverage, 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-[var(--color-ink-muted)] uppercase">
                    Rules fully met
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {tally.passed} / {audit.checks.length}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Each rule scores {GEO_MAX_POINTS_PER_RULE}, 5 or 0 points and
                every rule carries the same weight. Rules whose input was never
                captured are left out of the score entirely and show as reduced
                coverage — {tally.unknown} of {audit.checks.length} here.{' '}
                {readiness.note}
              </p>
              <GeoDisclaimer ruleVersion={audit.ruleVersion} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Rules"
              description="Every rule, the observable signal it reads, what was found and what to add."
            />
            <CardBody className="flex flex-col gap-4">
              {audit.checks.map((item) => {
                const meta = ruleMeta(item.ruleId);
                return (
                  <article
                    key={item.ruleId}
                    data-testid={`geo-check-${item.ruleId}`}
                    data-status={item.status}
                    data-points={item.points ?? 'n/a'}
                    className="rounded-md border border-[var(--color-line)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{meta.title}</h3>
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className="font-mono tabular-nums"
                          data-testid={`geo-points-${item.ruleId}`}
                        >
                          {item.points ?? '—'} / {GEO_MAX_POINTS_PER_RULE}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                    <p className="mt-2 text-sm">{item.message}</p>
                    <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                      <span className="font-medium">Signal read: </span>
                      {meta.signal}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      <span className="font-medium">What to add: </span>
                      {item.recommendation}
                    </p>
                    {item.evidence !== null && (
                      <p className="mt-2 font-mono text-xs break-all text-[var(--color-ink-muted)]">
                        Evidence: {item.evidence}
                      </p>
                    )}
                  </article>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}

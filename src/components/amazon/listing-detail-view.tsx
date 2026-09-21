'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Route } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from '@/components/ui/status-block';
import {
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { formatInteger, NOT_AVAILABLE } from '@/domain/format';
import {
  AMAZON_RULE_META,
  DEFAULT_AMAZON_CONFIG,
  type AmazonRuleId,
} from '@/domain/amazon/config';
import { byteLength } from '@/domain/amazon/rules';
import {
  loadListing,
  runAuditForListing,
  saveListingEdit,
  type AmazonDeps,
  type ListingDetailState,
} from '@/services/amazon-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { SeverityText, StatusBadge } from '@/components/seo/check-status';
import { AmazonDisclaimer, ChannelSeparationNote } from './amazon-disclaimer';

function ruleTitle(ruleId: string): string {
  return AMAZON_RULE_META[ruleId as AmazonRuleId]?.title ?? ruleId;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[var(--color-line)] py-2 last:border-b-0">
      <dt className="shrink-0 text-sm text-[var(--color-ink-muted)]">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function ListingDetailView({
  listingId,
  mode,
}: {
  listingId: string;
  mode: DemoDataMode | null;
}) {
  const deps = useMemo<AmazonDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ListingDetailState | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  // Form state is kept separately from the loaded listing so a failed save
  // never discards what the user typed.
  const [title, setTitle] = useState<string | null>(null);
  const [bulletText, setBulletText] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void loadListing(deps, listingId).then((next) => {
      if (cancelled) return;
      setState(next);
      if (next.status === 'ready') {
        setTitle((current) => current ?? next.row.listing.title);
        setBulletText(
          (current) => current ?? next.row.listing.bullets.join('\n'),
        );
        setTerms((current) => current ?? next.row.listing.backendSearchTerms);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deps, listingId, attempt]);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setRunMessage('');
    const result = await runAuditForListing(deps, listingId);
    setRunning(false);
    if (result.status === 'error') {
      setRunMessage(`${result.message} Nothing was changed.`);
      return;
    }
    setRunMessage('Audit re-run for this listing.');
    setAttempt((value) => value + 1);
  }, [deps, listingId]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    setFieldErrors({});

    const result = await saveListingEdit(deps, listingId, {
      title: title ?? '',
      bullets: bulletText ?? '',
      backendSearchTerms: terms ?? '',
    });
    setSaving(false);

    if (result.status === 'invalid') {
      setFieldErrors(result.errors);
      setSaveError('Nothing was saved. Fix the fields marked below.');
      return;
    }
    if (result.status === 'error') {
      setSaveError(
        `${result.message} Nothing was saved and your changes are still here — try again.`,
      );
      return;
    }
    setSaveSuccess('Saved. Any stored audit for this listing is now stale.');
    setAttempt((value) => value + 1);
  }, [deps, listingId, title, bulletText, terms]);

  if (state === null) {
    return <LoadingBlock label="Loading this listing." />;
  }

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load this listing"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'not-found') {
    return (
      <div data-testid="listing-not-found">
        <EmptyBlock
          title="No such listing"
          description="This listing id is not in the demo catalogue."
        />
      </div>
    );
  }

  const { listing, product, audit, tally } = state.row;
  const termBytes = byteLength((terms ?? '').trim());
  const overBudget = termBytes > DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes;

  return (
    <div className="flex flex-col gap-6" data-testid="listing-detail">
      <Card>
        <CardHeader
          title="Audit"
          description={
            audit === null
              ? 'This listing has not been audited yet.'
              : `Scored with rules ${audit.ruleVersion} on ${audit.auditedAt.slice(0, 10)}.`
          }
        >
          <button
            type="button"
            onClick={() => void runAudit()}
            disabled={running}
            data-testid="run-listing-audit"
            className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
          >
            {running ? 'Auditing…' : 'Run audit'}
          </button>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {runMessage !== '' && (
            <p
              role="status"
              aria-live="polite"
              className="text-sm"
              data-testid="run-listing-message"
            >
              {runMessage}
            </p>
          )}
          {audit?.stale === true && (
            <p className="text-sm" data-testid="listing-stale-notice">
              This listing changed after it was audited, so the score below
              describes the previous copy. Re-run the audit to refresh it.
            </p>
          )}
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              Score:{' '}
              <strong data-testid="listing-detail-score">
                {audit === null
                  ? 'Not audited'
                  : (audit.score ?? NOT_AVAILABLE)}
              </strong>
            </span>
            <span>Critical: {formatInteger(tally.critical)}</span>
            <span>Warnings: {formatInteger(tally.warnings)}</span>
            <span>Not assessed: {formatInteger(tally.unknown)}</span>
          </div>
          <AmazonDisclaimer />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Listing facts" description="As recorded, not fetched." />
          <CardBody>
            <dl>
              <DetailRow label="ASIN" value={listing.asin} />
              <DetailRow label="Marketplace" value={`${listing.marketplace} (US)`} />
              <DetailRow label="Status" value={listing.status} />
              <DetailRow label="Fulfilment" value={listing.fulfilment} />
              <DetailRow
                label="Images"
                value={formatInteger(listing.imageCount)}
              />
              <DetailRow
                label="Main image on white"
                value={listing.mainImageWhiteBackground}
              />
              <DetailRow label="Video" value={listing.hasVideo ? 'yes' : 'no'} />
              <DetailRow
                label="Brand registered"
                value={listing.brandRegistered ? 'yes' : 'no'}
              />
              <DetailRow
                label="A+ modules"
                value={
                  listing.aPlusModules.length === 0
                    ? 'none'
                    : listing.aPlusModules.join(', ')
                }
              />
              <DetailRow
                label="Browse node"
                value={listing.browseNode ?? 'none'}
              />
              <DetailRow
                label="Variation parent"
                value={listing.variationParentAsin ?? 'standalone'}
              />
              <DetailRow
                label="Reviews"
                value={
                  listing.averageRating === null
                    ? `${formatInteger(listing.reviewCount)} reviews`
                    : `${listing.averageRating.toFixed(1)} from ${formatInteger(listing.reviewCount)}`
                }
              />
              <DetailRow
                label="Buy box share"
                value={
                  listing.buyBoxPercentage === null
                    ? NOT_AVAILABLE
                    : `${(listing.buyBoxPercentage * 100).toFixed(1)}%`
                }
              />
            </dl>
            {product !== null && (
              <p className="mt-4 text-sm">
                <Link
                  href={`/products/${product.id}` as Route}
                  className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  data-testid="listing-product-link"
                >
                  Open the storefront product
                </Link>
              </p>
            )}
            <div className="mt-4">
              <ChannelSeparationNote />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Edit listing copy"
            description="Saving changes the audit inputs, so any stored score becomes stale until you re-run."
          />
          <CardBody className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="listing-title"
                className="block text-sm font-medium"
              >
                Title
              </label>
              <textarea
                id="listing-title"
                value={title ?? ''}
                onChange={(event) => setTitle(event.target.value)}
                rows={3}
                data-testid="listing-field-title"
                aria-describedby="listing-title-help"
                className="mt-1 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              />
              <p
                id="listing-title-help"
                className="mt-1 text-xs text-[var(--color-ink-muted)]"
              >
                {(title ?? '').length} characters. This project&apos;s guidance
                is {DEFAULT_AMAZON_CONFIG.titleMin}–
                {DEFAULT_AMAZON_CONFIG.titleMax}.
              </p>
              {fieldErrors['title'] !== undefined && (
                <p
                  role="alert"
                  className="mt-1 text-xs"
                  data-testid="listing-field-title-error"
                >
                  {fieldErrors['title']}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="listing-bullets"
                className="block text-sm font-medium"
              >
                Bullets, one per line
              </label>
              <textarea
                id="listing-bullets"
                value={bulletText ?? ''}
                onChange={(event) => setBulletText(event.target.value)}
                rows={7}
                data-testid="listing-field-bullets"
                aria-describedby="listing-bullets-help"
                className="mt-1 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              />
              <p
                id="listing-bullets-help"
                className="mt-1 text-xs text-[var(--color-ink-muted)]"
              >
                Amazon shows {DEFAULT_AMAZON_CONFIG.bulletsExpected}. Blank
                lines are ignored.
              </p>
              {fieldErrors['bullets'] !== undefined && (
                <p
                  role="alert"
                  className="mt-1 text-xs"
                  data-testid="listing-field-bullets-error"
                >
                  {fieldErrors['bullets']}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="listing-terms"
                className="block text-sm font-medium"
              >
                Backend search terms
              </label>
              <textarea
                id="listing-terms"
                value={terms ?? ''}
                onChange={(event) => setTerms(event.target.value)}
                rows={3}
                data-testid="listing-field-terms"
                aria-describedby="listing-terms-help"
                className="mt-1 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              />
              <p
                id="listing-terms-help"
                className="mt-1 text-xs text-[var(--color-ink-muted)]"
                data-testid="listing-terms-bytes"
              >
                {termBytes} of {DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes}{' '}
                bytes ({(terms ?? '').trim().length} characters).
                {overBudget
                  ? ' Over the limit — Amazon discards the overflow silently.'
                  : ' The limit is bytes, not characters: accented and non-Latin characters cost two to four bytes each.'}
              </p>
              {fieldErrors['backendSearchTerms'] !== undefined && (
                <p
                  role="alert"
                  className="mt-1 text-xs"
                  data-testid="listing-field-terms-error"
                >
                  {fieldErrors['backendSearchTerms']}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                data-testid="save-listing"
                className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save listing'}
              </button>
              {saveSuccess !== '' && (
                <span
                  role="status"
                  aria-live="polite"
                  className="text-sm"
                  data-testid="listing-save-success"
                >
                  {saveSuccess}
                </span>
              )}
            </div>
            {saveError !== '' && (
              <p role="alert" className="text-sm" data-testid="listing-save-failure">
                {saveError}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Checks"
          description="Every rule, its verdict and the evidence behind it."
        />
        <CardBody className="px-0 py-0">
          {audit === null ? (
            <div className="px-5 py-4">
              <p className="text-sm">
                No audit has been run for this listing yet.
              </p>
            </div>
          ) : (
            <TableWrapper>
              <Table caption="Listing audit checks with status, severity, finding and evidence">
                <THead>
                  <TR>
                    <TH>Check</TH>
                    <TH>Status</TH>
                    <TH>Severity</TH>
                    <TH>Finding</TH>
                    <TH>Evidence</TH>
                  </TR>
                </THead>
                <TBody>
                  {audit.checks.map((item) => (
                    <TR key={item.ruleId}>
                      <TH scope="row">
                        <span data-testid={`listing-check-${item.ruleId}`}>
                          {ruleTitle(item.ruleId)}
                        </span>
                      </TH>
                      <TD>
                        <StatusBadge status={item.status} />
                      </TD>
                      <TD>
                        <SeverityText
                          severity={item.severity}
                          status={item.status}
                        />
                      </TD>
                      <TD>
                        <span className="block">{item.message}</span>
                        {item.status !== 'pass' && (
                          <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">
                            {item.recommendation}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="block font-mono text-xs break-words">
                          {item.evidence ?? '—'}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </CardBody>
      </Card>

      <p className="text-sm">
        <Link
          href="/amazon"
          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          data-testid="back-to-amazon"
        >
          Back to all listings
        </Link>
      </p>
    </div>
  );
}

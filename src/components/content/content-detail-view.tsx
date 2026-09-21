'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorBlock, LoadingBlock } from '@/components/ui/status-block';
import {
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import type { Product } from '@/domain/types';
import {
  loadContentIdea,
  updateContentIdea,
  type ContentDetailState,
  type ContentServiceDeps,
} from '@/services/content-service';
import {
  resolveStateRepository,
  type DemoDataMode,
} from '@/services/demo-data-source';
import { ContentForm, valuesFromIdea, type ContentFormValues } from './content-form';

export function ContentDetailView({
  ideaId,
  mode,
}: {
  ideaId: string;
  mode: DemoDataMode | null;
}) {
  const deps = useMemo<ContentServiceDeps>(
    () => ({ state: resolveStateRepository(mode) }),
    [mode],
  );

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ContentDetailState | null>(null);
  const [products, setProducts] = useState<readonly Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadContentIdea(deps, ideaId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [deps, ideaId, attempt]);

  useEffect(() => {
    let cancelled = false;
    void deps.state.load().then((result) => {
      if (!cancelled) setProducts(result.state.products);
    });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  const handleSave = useCallback(
    async (values: ContentFormValues) => {
      const result = await updateContentIdea(deps, ideaId, values);
      if (result.status === 'saved') setAttempt((value) => value + 1);
      return result;
    },
    [deps, ideaId],
  );

  if (state === null) return <LoadingBlock label="Loading this content idea." />;

  if (state.status === 'error') {
    return (
      <ErrorBlock
        title="Could not load this content idea"
        message={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  if (state.status === 'not-found') {
    return (
      <>
        <PageHeader
          title="Content idea not found"
          description="No idea in the content plan has that ID."
        />
        <Card>
          <CardBody>
            <p className="text-sm" data-testid="content-not-found">
              This content idea does not exist.
            </p>
            <Link
              href="/content"
              className="mt-4 inline-block rounded-md border border-[var(--color-line-strong)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Back to the content plan
            </Link>
          </CardBody>
        </Card>
      </>
    );
  }

  const { row, extras } = state;

  return (
    <>
      <PageHeader
        title={row.idea.topic}
        description={`${row.idea.contentType} · ${row.idea.searchIntent} intent · ${row.idea.funnelStage} · status ${row.idea.status}`}
      >
        <Link
          href="/content"
          className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Back to the content plan
        </Link>
      </PageHeader>

      <Card>
        <CardHeader
          title="Opportunity score"
          description="Every input, its weight and what it contributed."
        />
        <CardBody className="flex flex-col gap-4">
          <p className="text-3xl font-semibold tabular-nums" data-testid="detail-opportunity">
            {row.breakdown.score}
          </p>
          <TableWrapper>
            <Table caption="Opportunity score breakdown">
              <THead>
                <TR>
                  <TH>Input</TH>
                  <TH>Source</TH>
                  <TH>Value</TH>
                  <TH>Weight</TH>
                  <TH>Contribution</TH>
                </TR>
              </THead>
              <TBody>
                {row.breakdown.parts.map((part) => (
                  <TR key={part.key}>
                    <TH scope="row">{part.label}</TH>
                    <TD>
                      {part.source === 'entered'
                        ? 'Entered by an editor'
                        : 'Derived from search intent'}
                    </TD>
                    <TD numeric>{part.input}</TD>
                    <TD numeric>{part.weight}</TD>
                    <TD numeric>{part.contribution.toFixed(1)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          {row.product !== null && (
            <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="text-sm font-medium">
                For contrast: the audit scores of {row.product.title}
              </p>
              <p className="mt-1 text-sm" data-testid="measured-scores">
                SEO {extras.measuredSeoScore ?? 'Not audited'} · GEO{' '}
                {extras.measuredGeoScore ?? 'Not audited'}
              </p>
              <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                Those are measured from the product page as it exists today.{' '}
                <strong>
                  They take no part in the opportunity score above
                </strong>
                , which is built from judgements about a topic that has not been
                written yet.
              </p>
            </div>
          )}

          {row.danglingProduct && (
            <p
              role="alert"
              data-testid="dangling-product"
              className="rounded-md border border-[var(--color-line)] px-4 py-3 text-sm"
            >
              This idea targets a product that is no longer in the catalogue.
              Pick a different target before planning against it.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Edit"
          description="Publishing status here is a planning record only — nothing is sent anywhere."
        />
        <CardBody>
          <ContentForm
            key={row.idea.id}
            initial={valuesFromIdea(row.idea)}
            products={products}
            submitLabel="Save changes"
            onSubmit={handleSave}
          />
        </CardBody>
      </Card>
    </>
  );
}

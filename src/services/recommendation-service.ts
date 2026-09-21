import { readAudit } from '@/domain/audit-lookup';
import { analyticsTotals, channelRows } from '@/domain/analytics/channel-metrics';
import { scoreForIdea } from '@/domain/content/opportunity';
import { buildFunnel } from '@/domain/funnel/funnel-metrics';
import { funnelRecommendations as funnelAdvice } from '@/domain/funnel/recommendations';
import { readListingAudit } from '@/domain/amazon/engine';
import {
  advertisingRecommendations,
  amazonRecommendations,
  analyticsRecommendations,
  contentRecommendations,
  funnelRecommendations as funnelTasks,
  geoRecommendations,
  mergeWithStatuses,
  seoRecommendations,
  type AdvertisingFindings,
  type AuditedListing,
  type AuditedPage,
  type ScoredContentIdea,
} from '@/domain/recommendations/aggregate';
import {
  EMPTY_RECOMMENDATION_QUERY,
  filterRecommendations,
  isRecommendationQueryActive,
  sortRecommendations,
  tallyRecommendations,
  type RecommendationQuery,
  type RecommendationTally,
} from '@/domain/recommendations/sorting';
import { DEMO_WINDOW, type DateWindow } from '@/domain/demo-window';
import {
  RECOMMENDATION_STATUSES,
  type Recommendation,
  type RecommendationStatus,
} from '@/domain/types';
import type { DemoState, DemoStateRepository } from '@/repositories/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';
import type { AmazonAdsRepository } from '@/repositories/amazon-ads-repository';
import { loadAdvertising } from '@/services/amazon-ads-service';

/**
 * Recommendation service.
 *
 * It calls the existing engines and merges their output with the stored Done
 * decisions. No rule or formula is re-implemented here: if the SEO audit
 * changes its mind about a page, this list changes with it on the next load.
 */

export interface RecommendationDeps {
  state: DemoStateRepository;
  traffic: TrafficRepository;
  /** Optional: without it the advertising source simply contributes nothing. */
  ads?: AmazonAdsRepository;
  window?: DateWindow;
  /** Injected so status timestamps are deterministic in tests. */
  now?: () => string;
}

export interface RecommendationView {
  items: Recommendation[];
  /** Every active item, before filtering — used for the counts. */
  allActive: Recommendation[];
  historical: Recommendation[];
  tally: RecommendationTally;
  queryActive: boolean;
  /** Sources that produced nothing, so the UI can say why rather than stay blank. */
  quietSources: string[];
}

export type RecommendationState =
  | { status: 'ready'; view: RecommendationView }
  | { status: 'empty'; view: RecommendationView }
  | { status: 'error'; message: string };

export type SetStatusResult =
  | { status: 'saved'; id: string; next: RecommendationStatus }
  | { status: 'error'; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function auditedPages(state: DemoState, kind: 'seo' | 'geo'): AuditedPage[] {
  const pages: AuditedPage[] = [];
  for (const snapshot of state.pageSnapshots) {
    const product =
      state.products.find((candidate) => candidate.id === snapshot.productId) ??
      null;
    // GEO never reads the keyword, so an empty one is passed deliberately.
    const audit = readAudit(
      state.auditResults,
      snapshot,
      kind === 'seo' ? (product?.primaryKeyword ?? '') : '',
      kind,
    );
    if (audit === null) continue;
    pages.push({
      pageId: snapshot.id,
      productId: product?.id ?? null,
      productTitle: product?.title ?? snapshot.url,
      productStatus: product?.status ?? null,
      audit,
    });
  }
  return pages;
}

/**
 * Listings that have been audited. Unaudited ones contribute nothing, exactly
 * as unaudited pages do: a task needs a finding behind it.
 */
function auditedListings(state: DemoState): AuditedListing[] {
  const entries: AuditedListing[] = [];
  for (const listing of state.amazonListings) {
    const product =
      state.products.find((candidate) => candidate.id === listing.productId) ??
      null;
    const audit = readListingAudit(state.listingAudits, listing, product);
    if (audit === null) continue;
    entries.push({
      listingId: listing.id,
      asin: listing.asin,
      productId: product?.id ?? null,
      productTitle: product?.title ?? listing.asin,
      listingStatus: listing.status,
      audit,
    });
  }
  return entries;
}

export async function loadRecommendations(
  deps: RecommendationDeps,
  query: RecommendationQuery = EMPTY_RECOMMENDATION_QUERY,
): Promise<RecommendationState> {
  const window = deps.window ?? DEMO_WINDOW;

  let state: DemoState;
  let traffic;
  try {
    const [stateResult, trafficResult] = await Promise.all([
      deps.state.load(),
      deps.traffic.load(),
    ]);
    state = stateResult.state;
    traffic = trafficResult;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load recommendations.'),
    };
  }

  const analyticsInput = {
    sessions: traffic.sessions,
    orders: traffic.orders,
    channelSpend: traffic.channelSpend,
    window,
  };
  const totals = analyticsTotals(analyticsInput);

  const funnelReport = buildFunnel({ sessions: traffic.sessions, window });

  const scoredIdeas: ScoredContentIdea[] = state.contentIdeas.map((idea) => ({
    idea,
    opportunity: scoreForIdea(idea),
    product:
      state.products.find((candidate) => candidate.id === idea.targetProductId) ??
      null,
  }));

  // Advertising is optional: a caller without a report source gets a list
  // without advertising tasks rather than an error.
  let advertising: Recommendation[] = [];
  if (deps.ads !== undefined) {
    const ads = await loadAdvertising({
      ads: deps.ads,
      state: deps.state,
      window,
    });
    if (ads.status === 'ready') {
      const productIdByListing = new Map(
        state.amazonListings.map((listing) => [listing.id, listing.productId]),
      );
      const findings: AdvertisingFindings = {
        harvest: ads.view.harvest,
        negations: ads.view.negations,
        overTargetCampaigns: ads.view.overTargetCampaigns.map((row) => ({
          campaignId: row.campaign.id,
          campaignName: row.campaign.name,
          listingId: row.campaign.listingId,
          acos: row.acos ?? 0,
          spendCents: row.spendCents,
          clicks: row.clicks,
        })),
        lowOrganicAsins: ads.view.asins
          .filter((row) => row.lowOrganicShare)
          .map((row) => ({
            listingId: row.listingId,
            title: row.label?.title ?? row.listingId,
            organicShare: row.organicShare ?? 0,
            totalSalesCents: row.totalSalesCents,
          })),
        targetAcos: ads.view.config.targetAcos,
        organicShareFloor: ads.view.config.organicShareFloor,
        ruleVersion: ads.view.ruleVersion,
        productIdFor: (listingId) => productIdByListing.get(listingId) ?? null,
      };
      advertising = advertisingRecommendations(findings);
    }
  }

  const generated = [
    ...seoRecommendations(auditedPages(state, 'seo')),
    ...geoRecommendations(auditedPages(state, 'geo')),
    ...contentRecommendations(scoredIdeas),
    ...analyticsRecommendations({
      channels: channelRows(analyticsInput),
      averageOrderValueCents: totals.averageOrderValueCents,
    }),
    ...funnelTasks(
      funnelAdvice({
        transitions: funnelReport.transitions,
        largestDropOff: funnelReport.largestDropOff,
      }),
    ),
    ...amazonRecommendations(auditedListings(state)),
    ...advertising,
  ];

  const merged = mergeWithStatuses(generated, state.recommendationStatuses);
  const allActive = sortRecommendations(merged.active);
  const items = sortRecommendations(filterRecommendations(allActive, query));

  const produced = new Set(allActive.map((item) => item.source));
  const quietSources = ([
    'seo',
    'geo',
    'content',
    'analytics',
    'funnel',
    'amazon',
  ] as const)
    .filter((source) => !produced.has(source))
    .map((source) => source);

  const view: RecommendationView = {
    items,
    allActive,
    historical: merged.historical,
    tally: tallyRecommendations(allActive),
    queryActive: isRecommendationQueryActive(query),
    quietSources,
  };

  return allActive.length === 0
    ? { status: 'empty', view }
    : { status: 'ready', view };
}

/**
 * Writes only the decision. The task itself is never persisted, so it cannot
 * drift away from what the engines currently report.
 */
export async function setRecommendationStatus(
  deps: RecommendationDeps,
  id: string,
  next: string,
): Promise<SetStatusResult> {
  if (!(RECOMMENDATION_STATUSES as readonly string[]).includes(next)) {
    return { status: 'error', message: 'Unknown status.' };
  }
  const status = next as RecommendationStatus;
  const now = deps.now ?? (() => new Date().toISOString());

  let state: DemoState;
  try {
    state = (await deps.state.load()).state;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not read the saved decisions.'),
    };
  }

  const others = state.recommendationStatuses.filter(
    (record) => record.id !== id,
  );
  // Undoing a completion removes the record rather than storing "Open": the
  // absence of a decision is exactly what Open means.
  const recommendationStatuses =
    status === 'Done'
      ? [...others, { id, status, updatedAt: now() }]
      : others;

  try {
    await deps.state.save({ ...state, recommendationStatuses });
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not save your decision.'),
    };
  }

  return { status: 'saved', id, next: status };
}

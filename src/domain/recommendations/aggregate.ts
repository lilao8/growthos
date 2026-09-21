import { SEO_RULE_META, type SeoRuleId } from '../seo-audit/config';
import { AMAZON_RULE_META, type AmazonRuleId } from '../amazon/config';
import { GEO_RULE_META, type GeoRuleId } from '../geo-audit/config';
import { STAGE_LABELS } from '../funnel/funnel-metrics';
import type { FunnelRecommendation } from '../funnel/recommendations';
import type { ChannelRow } from '../analytics/channel-metrics';
import type {
  HarvestCandidate,
  NegationCandidate,
} from '../amazon/harvest';
import { formatCents } from '../money';
// CAC and AOV are division results and may carry fractional cents, so they go
// through the metric formatter, which rounds, rather than the strict one.
import { formatMoneyMetric } from '../format';
import { recommendationId } from '../stable-id';
import {
  AD_WEIGHTS,
  AMAZON_WEIGHTS,
  ANALYTICS_THRESHOLDS,
  ANALYTICS_WEIGHTS,
  CONTENT_THRESHOLDS,
  CONTENT_WEIGHT,
  DEFAULT_AD_WEIGHT,
  TRAFFIC_IMPACT_ADJUSTMENT,
  type TrafficBand,
  DEFAULT_AMAZON_WEIGHT,
  DEFAULT_FUNNEL_WEIGHT,
  DEFAULT_GEO_WEIGHT,
  DEFAULT_SEO_WEIGHT,
  FUNNEL_WEIGHTS,
  GEO_WEIGHTS,
  priorityFrom,
  quadrantFor,
  RECOMMENDATION_RULE_VERSION,
  SEO_WEIGHTS,
  type Weighting,
} from './config';
import type {
  AuditResult,
  ContentIdea,
  ListingAudit,
  ListingStatus,
  Product,
  ProductStatus,
  Recommendation,
  RecommendationSource,
  RecommendationStatusRecord,
} from '../types';

/**
 * Aggregation.
 *
 * Every recommendation here is derived from a rule engine that already exists.
 * Nothing re-implements a score or a threshold: the SEO and GEO audits supply
 * their own verdicts, the funnel supplies its own drop-off analysis, and this
 * module only decides what is worth raising as a task, how much it is likely to
 * be worth, and where to go to do it.
 */

interface BuildArgs {
  source: RecommendationSource;
  ruleId: string;
  sourceEntityId: string;
  title: string;
  category: string;
  reason: string;
  suggestedAction: string;
  evidence: string | null;
  link: string;
  relatedProductId: string | null;
  ruleVersion: string;
  weighting: Weighting;
  /** Drives priority: a hard failure outranks a soft one at the same impact. */
  severeFailure: boolean;
}

function build(args: BuildArgs): Recommendation {
  const { impact, effort } = args.weighting;
  return {
    id: recommendationId(args.source, args.ruleId, args.sourceEntityId),
    source: args.source,
    ruleId: args.ruleId,
    sourceEntityId: args.sourceEntityId,
    title: args.title,
    category: args.category,
    priority: priorityFrom(impact, args.severeFailure),
    impact,
    effort,
    reason: args.reason,
    suggestedAction: args.suggestedAction,
    relatedProductId: args.relatedProductId,
    status: 'Open',
    evidence: args.evidence,
    ruleVersion: args.ruleVersion,
    link: args.link,
    quadrant: quadrantFor(impact, effort),
    active: true,
    ignore: null,
  };
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

export interface AuditedPage {
  pageId: string;
  productId: string | null;
  productTitle: string;
  /** null when the page has no product behind it. */
  productStatus: ProductStatus | null;
  audit: AuditResult;
  /** Where this page sits in the catalogue by session volume. */
  trafficBand: TrafficBand;
  /** Sessions that viewed it, for the evidence line. null when unrecorded. */
  viewSessions: number | null;
}

/**
 * A finding on a page nobody can buy from is worth less than the same finding
 * on a live one. Rather than hiding it — a draft about to go live still needs
 * fixing — its impact is reduced so it sorts below the live pages, and the
 * reason says why.
 */
const UNPUBLISHED_IMPACT_PENALTY = 2;

function clampImpact(value: number): Weighting['impact'] {
  return Math.min(5, Math.max(1, value)) as Weighting['impact'];
}

/**
 * Applies the two page-level adjustments: publication status, then traffic.
 *
 * The order matters, and so does the exclusion. An unpublished product has no
 * traffic *because* it is unpublished, so banding it as quiet and penalising
 * it again would charge it twice for one fact. Status wins and traffic is
 * skipped; the note says which reason applied.
 */
interface PageAdjustment {
  weighting: Weighting;
  note: string;
  /**
   * True only when the page cannot be reached at all, which is what makes an
   * outright failure on it non-urgent.
   *
   * Deliberately explicit rather than inferred from `note === ''`: the traffic
   * adjustment also writes a note, including when it *raises* impact, and
   * keying severity off the note's presence would quietly strip severity from
   * every finding on a busy page.
   */
  unreachable: boolean;
}

function adjustForPage(
  weighting: Weighting,
  status: ProductStatus | null,
  band: TrafficBand,
  viewSessions: number | null,
): PageAdjustment {
  if (status !== null && status !== 'active') {
    return {
      weighting: {
        ...weighting,
        impact: clampImpact(weighting.impact - UNPUBLISHED_IMPACT_PENALTY),
      },
      note: ` This product is ${status}, so the finding is real but cannot affect anything until it is published.`,
      unreachable: true,
    };
  }

  const shift = TRAFFIC_IMPACT_ADJUSTMENT[band];
  if (shift === 0) return { weighting, note: '', unreachable: false };

  const sessions = viewSessions ?? 0;
  const note =
    band === 'high'
      ? ` This page is in the busiest third of the catalogue (${sessions} sessions viewed it), so the same fix reaches more people here than elsewhere.`
      : band === 'none'
        ? ' No session viewed this page in the window, so fixing it changes nothing until something sends traffic to it.'
        : ` This page is in the quietest third of the catalogue (${sessions} sessions viewed it), so the same fix is worth less here than elsewhere.`;

  return {
    weighting: { ...weighting, impact: clampImpact(weighting.impact + shift) },
    note,
    unreachable: false,
  };
}

export function seoRecommendations(
  pages: readonly AuditedPage[],
): Recommendation[] {
  const items: Recommendation[] = [];
  for (const page of pages) {
    for (const check of page.audit.checks) {
      // Passing checks are not tasks, and an unassessed one has nothing to act
      // on until the input exists.
      if (check.status !== 'error' && check.status !== 'warning') continue;

      const meta = SEO_RULE_META[check.ruleId as SeoRuleId];
      const adjusted = adjustForPage(
        SEO_WEIGHTS[check.ruleId] ?? DEFAULT_SEO_WEIGHT,
        page.productStatus,
        page.trafficBand,
        page.viewSessions,
      );
      items.push(
        build({
          source: 'seo',
          ruleId: check.ruleId,
          sourceEntityId: page.pageId,
          title: `${meta?.title ?? check.ruleId} — ${page.productTitle}`,
          category: 'On-page SEO',
          reason: `${check.message} ${check.explanation}${adjusted.note}`,
          suggestedAction: check.recommendation,
          evidence: check.evidence,
          link: `/seo/${page.pageId}`,
          relatedProductId: page.productId,
          ruleVersion: page.audit.ruleVersion,
          weighting: adjusted.weighting,
          severeFailure: check.status === 'error' && !adjusted.unreachable,
        }),
      );
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// GEO
// ---------------------------------------------------------------------------

export function geoRecommendations(
  pages: readonly AuditedPage[],
): Recommendation[] {
  const items: Recommendation[] = [];
  for (const page of pages) {
    for (const check of page.audit.checks) {
      // Full marks is nothing to do; a rule that could not be assessed has no
      // action behind it either.
      if (check.points === null || check.points >= 10) continue;

      const meta = GEO_RULE_META[check.ruleId as GeoRuleId];
      const adjusted = adjustForPage(
        GEO_WEIGHTS[check.ruleId] ?? DEFAULT_GEO_WEIGHT,
        page.productStatus,
        page.trafficBand,
        page.viewSessions,
      );
      items.push(
        build({
          source: 'geo',
          ruleId: check.ruleId,
          sourceEntityId: page.pageId,
          title: `${meta?.title ?? check.ruleId} — ${page.productTitle}`,
          category: 'Generative search readiness',
          reason: `${check.message} Scored ${check.points} of 10.${adjusted.note}`,
          suggestedAction: check.recommendation,
          evidence: check.evidence,
          link: `/geo/${page.pageId}`,
          relatedProductId: page.productId,
          ruleVersion: page.audit.ruleVersion,
          weighting: adjusted.weighting,
          severeFailure: check.points === 0 && !adjusted.unreachable,
        }),
      );
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Amazon listings
// ---------------------------------------------------------------------------

export interface AuditedListing {
  listingId: string;
  asin: string;
  productId: string | null;
  productTitle: string;
  listingStatus: ListingStatus;
  audit: ListingAudit;
}

/**
 * Listing status adjusts impact in the opposite direction to product status,
 * and the difference is the whole point.
 *
 * A storefront draft is not published yet, so a finding on it cannot affect
 * anything until someone publishes — it is demoted. A *suppressed* listing is
 * the reverse: it was live, Amazon took it down, and it is losing sales right
 * now. Demoting it the way a draft is demoted would bury the single most
 * urgent thing in the catalogue, so suppression is never demoted.
 *
 * `inactive` is the genuine analogue of a draft: deliberately not selling.
 */
function adjustForListingStatus(
  weighting: Weighting,
  status: ListingStatus,
): { weighting: Weighting; note: string } {
  if (status === 'suppressed') {
    return {
      weighting,
      note: ' This listing is suppressed, so it is losing sales now — this is not something to schedule for later.',
    };
  }
  if (status === 'inactive') {
    const impact = Math.max(
      1,
      weighting.impact - UNPUBLISHED_IMPACT_PENALTY,
    ) as Weighting['impact'];
    return {
      weighting: { ...weighting, impact },
      note: ' This listing is inactive, so the finding is real but cannot affect anything until it is selling again.',
    };
  }
  return { weighting, note: '' };
}

export function amazonRecommendations(
  listings: readonly AuditedListing[],
): Recommendation[] {
  const items: Recommendation[] = [];
  for (const entry of listings) {
    for (const check of entry.audit.checks) {
      if (check.status !== 'error' && check.status !== 'warning') continue;

      const meta = AMAZON_RULE_META[check.ruleId as AmazonRuleId];
      const adjusted = adjustForListingStatus(
        AMAZON_WEIGHTS[check.ruleId] ?? DEFAULT_AMAZON_WEIGHT,
        entry.listingStatus,
      );
      items.push(
        build({
          source: 'amazon',
          ruleId: check.ruleId,
          sourceEntityId: entry.listingId,
          title: `${meta?.title ?? check.ruleId} — ${entry.productTitle}`,
          category: 'Amazon listing',
          reason: `${check.message} ${check.explanation}${adjusted.note}`,
          suggestedAction: check.recommendation,
          evidence:
            check.evidence === null
              ? `ASIN ${entry.asin}`
              : `${check.evidence} (ASIN ${entry.asin})`,
          link: `/amazon/${entry.listingId}`,
          relatedProductId: entry.productId,
          ruleVersion: entry.audit.ruleVersion,
          weighting: adjusted.weighting,
          // An inactive listing's failure is not urgent; a suppressed one's is.
          severeFailure:
            check.status === 'error' && entry.listingStatus !== 'inactive',
        }),
      );
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Amazon advertising
// ---------------------------------------------------------------------------

export interface AdvertisingFindings {
  harvest: readonly HarvestCandidate[];
  negations: readonly NegationCandidate[];
  overTargetCampaigns: readonly {
    campaignId: string;
    campaignName: string;
    listingId: string;
    acos: number;
    spendCents: number;
    clicks: number;
  }[];
  lowOrganicAsins: readonly {
    listingId: string;
    title: string;
    organicShare: number;
    totalSalesCents: number;
  }[];
  targetAcos: number;
  organicShareFloor: number;
  ruleVersion: string;
  /** Resolves a listing to the product behind it, for the task's link. */
  productIdFor: (listingId: string) => string | null;
}

/**
 * Advertising findings as tasks.
 *
 * Every one of these is a suggestion to test. Nothing here changes a bid, a
 * budget or a negative keyword list, and the wording keeps that distinction —
 * the funnel module set the same rule for the same reason.
 */
export function advertisingRecommendations(
  findings: AdvertisingFindings,
): Recommendation[] {
  const items: Recommendation[] = [];
  const link = '/amazon/advertising';

  for (const item of findings.negations) {
    items.push(
      build({
        source: 'amazon',
        ruleId: 'negate-search-term',
        // Keyed by term and target: the same wasteful query under two targets
        // is two separate decisions with two separate bids.
        sourceEntityId: `${item.sourceTargetId}:${item.customerSearchTerm}`,
        title: `Wasted spend on “${item.customerSearchTerm}”`,
        category: 'Amazon advertising',
        reason: item.reason,
        suggestedAction: item.suggestedAction,
        evidence: `${item.evidence} · ${formatCents(item.spendCents)} spent`,
        link,
        relatedProductId: findings.productIdFor(item.listingId),
        ruleVersion: findings.ruleVersion,
        weighting: AD_WEIGHTS['negate-search-term'] ?? DEFAULT_AD_WEIGHT,
        severeFailure: true,
      }),
    );
  }

  for (const item of findings.harvest) {
    items.push(
      build({
        source: 'amazon',
        ruleId: 'harvest-search-term',
        sourceEntityId: `${item.sourceTargetId}:${item.customerSearchTerm}`,
        title: `Harvest “${item.customerSearchTerm}” into its own target`,
        category: 'Amazon advertising',
        reason: item.reason,
        suggestedAction: item.suggestedAction,
        evidence: item.evidence,
        link,
        relatedProductId: findings.productIdFor(item.listingId),
        ruleVersion: findings.ruleVersion,
        weighting: AD_WEIGHTS['harvest-search-term'] ?? DEFAULT_AD_WEIGHT,
        severeFailure: false,
      }),
    );
  }

  for (const row of findings.overTargetCampaigns) {
    items.push(
      build({
        source: 'amazon',
        ruleId: 'campaign-acos',
        sourceEntityId: row.campaignId,
        title: `ACOS above target — ${row.campaignName}`,
        category: 'Amazon advertising',
        reason: `This campaign is running at an ACOS of ${(row.acos * 100).toFixed(1)}% against a target of ${(findings.targetAcos * 100).toFixed(0)}%, on ${row.clicks} clicks. It may be bidding above what the conversion rate supports, or matching queries the listing does not answer.`,
        suggestedAction:
          'Read the campaign’s own search term rows before changing a bid: a high ACOS driven by a few irrelevant queries is a negation problem, while one spread evenly across relevant queries is a bid or a listing problem. The two have different fixes.',
        evidence: `ACOS ${(row.acos * 100).toFixed(1)}% · ${formatCents(row.spendCents)} spent · ${row.clicks} clicks`,
        link,
        relatedProductId: findings.productIdFor(row.listingId),
        ruleVersion: findings.ruleVersion,
        weighting: AD_WEIGHTS['campaign-acos'] ?? DEFAULT_AD_WEIGHT,
        severeFailure: false,
      }),
    );
  }

  for (const row of findings.lowOrganicAsins) {
    items.push(
      build({
        source: 'amazon',
        ruleId: 'low-organic-share',
        sourceEntityId: row.listingId,
        title: `Sales depend on advertising — ${row.title}`,
        category: 'Amazon advertising',
        reason: `Only ${(row.organicShare * 100).toFixed(1)}% of this ASIN’s sales came from outside advertising, against a floor of ${(findings.organicShareFloor * 100).toFixed(0)}%. If the ads pause, most of this revenue may pause with them.`,
        suggestedAction:
          'Treat this as a demand problem rather than an ad problem. Reviews, listing quality and ranking for its main keyword are what build sales that survive a paused campaign — verify by checking whether organic share moves at all over the next few weeks.',
        evidence: `organic share ${(row.organicShare * 100).toFixed(1)}% · ${formatCents(row.totalSalesCents)} total sales`,
        link,
        relatedProductId: findings.productIdFor(row.listingId),
        ruleVersion: findings.ruleVersion,
        weighting: AD_WEIGHTS['low-organic-share'] ?? DEFAULT_AD_WEIGHT,
        severeFailure: false,
      }),
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export interface ScoredContentIdea {
  idea: ContentIdea;
  opportunity: number;
  product: Product | null;
}

export function contentRecommendations(
  ideas: readonly ScoredContentIdea[],
): Recommendation[] {
  return ideas
    .filter(
      (entry) =>
        entry.opportunity >= CONTENT_THRESHOLDS.highOpportunity &&
        CONTENT_THRESHOLDS.unstartedStatuses.includes(entry.idea.status),
    )
    .map((entry) =>
      build({
        source: 'content',
        ruleId: 'high-opportunity-unstarted',
        sourceEntityId: entry.idea.id,
        title: `Start writing: ${entry.idea.topic}`,
        category: 'Content plan',
        reason: `This topic scores ${entry.opportunity} on the opportunity model and is still at "${entry.idea.status}". The score is built from an editor's judgements, not from audit results or search volume.`,
        suggestedAction:
          'Move it into Writing, or lower the opportunity estimate if it no longer looks worth the effort.',
        evidence: `opportunity ${entry.opportunity}; intent ${entry.idea.searchIntent}; stage ${entry.idea.funnelStage}`,
        link: `/content/${entry.idea.id}`,
        relatedProductId: entry.idea.targetProductId,
        ruleVersion: RECOMMENDATION_RULE_VERSION,
        weighting: CONTENT_WEIGHT,
        severeFailure: entry.opportunity >= 85,
      }),
    );
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsRecommendationInput {
  channels: readonly ChannelRow[];
  /** Site-wide AOV in cents, used to judge whether a CAC is sustainable. */
  averageOrderValueCents: number | null;
}

export function analyticsRecommendations({
  channels,
  averageOrderValueCents,
}: AnalyticsRecommendationInput): Recommendation[] {
  const items: Recommendation[] = [];

  for (const channel of channels) {
    // Below the minimum traffic there is no conclusion to draw, only noise.
    // Saying nothing is the honest output here.
    if (channel.sessions < ANALYTICS_THRESHOLDS.minimumSessions) continue;

    const lowConfidence = channel.orders < ANALYTICS_THRESHOLDS.minimumOrders;
    const confidenceNote = lowConfidence
      ? ` Based on only ${channel.orders} orders, so treat the rate as indicative rather than settled.`
      : '';

    if (
      channel.conversionRate !== null &&
      channel.conversionRate < ANALYTICS_THRESHOLDS.lowConversionRate
    ) {
      items.push(
        build({
          source: 'analytics',
          ruleId: 'high-traffic-low-conversion',
          sourceEntityId: channel.channel,
          title: `${channel.channel}: traffic is arriving but not converting`,
          category: 'Channel performance',
          reason: `${channel.sessions.toLocaleString()} sessions converted at ${(channel.conversionRate * 100).toFixed(2)}%, below the ${(ANALYTICS_THRESHOLDS.lowConversionRate * 100).toFixed(2)}% threshold this project uses.${confidenceNote}`,
          suggestedAction:
            'Check what this channel is landing on and whether the promise made before the click matches the page.',
          evidence: `sessions ${channel.sessions}; orders ${channel.orders}; conversion ${(channel.conversionRate * 100).toFixed(2)}%`,
          link: '/analytics',
          relatedProductId: null,
          ruleVersion: RECOMMENDATION_RULE_VERSION,
          weighting:
            ANALYTICS_WEIGHTS['high-traffic-low-conversion'] ?? DEFAULT_SEO_WEIGHT,
          severeFailure: !lowConfidence,
        }),
      );
    }

    if (
      channel.adSpendCents > 0 &&
      channel.roas !== null &&
      channel.roas < ANALYTICS_THRESHOLDS.minimumRoas
    ) {
      items.push(
        build({
          source: 'analytics',
          ruleId: 'roas-below-target',
          sourceEntityId: channel.channel,
          title: `${channel.channel}: return on ad spend is below target`,
          category: 'Paid efficiency',
          reason: `${formatCents(channel.adSpendCents)} of ad spend returned ${channel.roas.toFixed(2)}x, below the ${ANALYTICS_THRESHOLDS.minimumRoas.toFixed(2)}x this project treats as the floor.${confidenceNote}`,
          suggestedAction:
            'Decide whether to cut the spend, change the targeting, or accept it as an acquisition cost — and write down which.',
          evidence: `ad spend ${formatCents(channel.adSpendCents)}; revenue ${formatCents(channel.revenueCents)}; ROAS ${channel.roas.toFixed(2)}x`,
          link: '/analytics',
          relatedProductId: null,
          ruleVersion: RECOMMENDATION_RULE_VERSION,
          weighting: ANALYTICS_WEIGHTS['roas-below-target'] ?? DEFAULT_SEO_WEIGHT,
          severeFailure: channel.roas < 1,
        }),
      );
    }

    if (
      channel.cacCents !== null &&
      channel.cacCents > 0 &&
      averageOrderValueCents !== null &&
      channel.cacCents >
        averageOrderValueCents * ANALYTICS_THRESHOLDS.maxCacShareOfAov
    ) {
      const share = channel.cacCents / averageOrderValueCents;
      items.push(
        build({
          source: 'analytics',
          ruleId: 'cac-above-aov-share',
          sourceEntityId: channel.channel,
          title: `${channel.channel}: acquisition cost is high against order value`,
          category: 'Paid efficiency',
          reason: `A new customer costs ${formatMoneyMetric(channel.cacCents)}, which is ${(share * 100).toFixed(0)}% of the ${formatMoneyMetric(averageOrderValueCents)} average order. That only works if they come back.${confidenceNote}`,
          suggestedAction:
            'Check repeat purchase rate for this channel before judging it. If they do not return, the spend is not paying for itself.',
          evidence: `CAC ${formatMoneyMetric(channel.cacCents)}; new customers ${channel.newCustomers}; site AOV ${formatMoneyMetric(averageOrderValueCents)}`,
          link: '/analytics',
          relatedProductId: null,
          ruleVersion: RECOMMENDATION_RULE_VERSION,
          weighting: ANALYTICS_WEIGHTS['cac-above-aov-share'] ?? DEFAULT_SEO_WEIGHT,
          severeFailure: share >= 1,
        }),
      );
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

/**
 * One task per funnel step rather than one per hypothesis. The funnel page
 * lists every check; a task list needs "look at this step", with the checks as
 * the action.
 */
export function funnelRecommendations(
  advice: readonly FunnelRecommendation[],
): Recommendation[] {
  const byStep = new Map<string, FunnelRecommendation[]>();
  for (const item of advice) {
    const key = `${item.from}->${item.to}`;
    const existing = byStep.get(key);
    if (existing === undefined) byStep.set(key, [item]);
    else existing.push(item);
  }

  return [...byStep.entries()].map(([key, group]) => {
    const first = group[0];
    if (first === undefined) throw new RangeError('Empty funnel step group');

    const checks = group
      .map((item, index) => `${index + 1}. ${item.hypothesis} ${item.howToCheck}`)
      .join(' ');

    return build({
      source: 'funnel',
      ruleId: key,
      sourceEntityId: key,
      title: `${STAGE_LABELS[first.from]} → ${STAGE_LABELS[first.to]}: investigate the drop-off`,
      category: 'Conversion funnel',
      reason:
        first.raisedBecause === 'below-threshold'
          ? `This step converts at ${((first.conversion ?? 0) * 100).toFixed(2)}%, below the ${(first.threshold * 100).toFixed(2)}% threshold, on ${first.sampleSessions.toLocaleString()} sessions.`
          : `This step loses the largest share in the funnel — ${((first.dropOffRate ?? 0) * 100).toFixed(2)}% of ${first.sampleSessions.toLocaleString()} sessions. Its conversion is within threshold, so this is about volume rather than underperformance.`,
      suggestedAction: `Work through the hypotheses, none of which is a diagnosis: ${checks}`,
      evidence: `${first.dropOffSessions.toLocaleString()} sessions lost; sample ${first.sampleSessions.toLocaleString()}; confidence ${first.confidence}`,
      link: '/funnel',
      relatedProductId: null,
      ruleVersion: first.ruleVersion,
      weighting: FUNNEL_WEIGHTS[key] ?? DEFAULT_FUNNEL_WEIGHT,
      severeFailure:
        first.raisedBecause === 'below-threshold' && first.confidence === 'normal',
    });
  });
}

// ---------------------------------------------------------------------------
// Merging with stored status
// ---------------------------------------------------------------------------

export interface MergedRecommendations {
  /** Problems the engines still report, with any stored decision applied. */
  active: Recommendation[];
  /**
   * Tasks that were marked done but whose underlying problem has since gone.
   * Kept so the record of the decision is not lost, never shown as to-do.
   */
  historical: Recommendation[];
}

/**
 * Generating twice must not create two tasks: ids come from rule + entity, so
 * a regenerated list lines up with the stored decisions exactly. Where evidence
 * has changed but the id has not, the newest evidence wins and the decision
 * stands.
 */
export function mergeWithStatuses(
  generated: readonly Recommendation[],
  statuses: readonly RecommendationStatusRecord[],
): MergedRecommendations {
  const statusById = new Map(statuses.map((record) => [record.id, record]));

  const seen = new Set<string>();
  const active: Recommendation[] = [];
  for (const item of generated) {
    // A rule firing twice for the same entity is one task, not two.
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const record = statusById.get(item.id);
    const status = record?.status ?? 'Open';
    active.push({
      ...item,
      status,
      active: true,
      ignore:
        record !== undefined && status === 'Ignored' && record.reason !== null
          ? {
              reason: record.reason,
              note: record.note,
              decidedAt: record.updatedAt,
              // The evidence is compared rather than trusted, the same way an
              // audit's staleness is derived rather than stored.
              needsReview: record.evidenceAtDecision !== item.evidence,
            }
          : null,
    });
  }

  const historical: Recommendation[] = [];
  for (const record of statuses) {
    if (seen.has(record.id)) continue;
    // An ignored finding that stopped firing needs no record: the thing that
    // was set aside is gone, so there is no standing decision to honour.
    if (record.status !== 'Done') continue;
    historical.push({
      id: record.id,
      source: 'seo',
      ruleId: 'unknown',
      sourceEntityId: 'unknown',
      title: 'Completed task whose source finding no longer appears',
      category: 'History',
      priority: 'Low',
      impact: 1,
      effort: 1,
      reason:
        'This was marked done, and the rule that raised it no longer reports a problem. Kept as a record of the decision.',
      suggestedAction: 'Nothing to do.',
      relatedProductId: null,
      status: 'Done',
      evidence: `marked done ${record.updatedAt}`,
      ruleVersion: RECOMMENDATION_RULE_VERSION,
      link: '/recommendations',
      quadrant: 'Low Priority',
      active: false,
      ignore: null,
    });
  }

  return { active, historical };
}

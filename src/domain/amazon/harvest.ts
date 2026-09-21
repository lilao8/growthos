import type { AdTarget } from '../types';
import { DEFAULT_AD_CONFIG, type AdConfig } from './ad-config';
import type { SearchTermAggregate } from './ad-metrics';

/**
 * Harvest and negation candidates.
 *
 * Both are **suggestions to test**, never instructions and never actions. This
 * project changes no bid, no budget and no negative keyword list; the wording
 * says "may" and each candidate carries the clicks and spend it rests on, so an
 * operator can disagree with the arithmetic rather than with a verdict.
 *
 * The discipline that matters: nothing is concluded below the minimum click
 * count. A search term with four clicks and no order has not demonstrated
 * anything, and the most common way to waste money in this job is to act as
 * though it has.
 */

export interface HarvestCandidate {
  customerSearchTerm: string;
  /** The target that matched it — a broad, phrase or auto target. */
  sourceTargetId: string;
  sourceExpression: string;
  sourceMatchType: SearchTermAggregate['matchType'];
  campaignId: string;
  campaignName: string;
  listingId: string;
  clicks: number;
  spendCents: number;
  adSalesCents: number;
  adOrders: number;
  /** Below the target ACOS by at least the configured margin. */
  acos: number;
  reason: string;
  suggestedAction: string;
  evidence: string;
}

export interface NegationCandidate {
  customerSearchTerm: string;
  sourceTargetId: string;
  sourceExpression: string;
  sourceMatchType: SearchTermAggregate['matchType'];
  campaignId: string;
  campaignName: string;
  listingId: string;
  clicks: number;
  spendCents: number;
  reason: string;
  suggestedAction: string;
  evidence: string;
}

/** Matching is on the literal text, lowercased and whitespace-collapsed. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Search terms a broad, phrase or auto target found that are converting well
 * and are not yet being bid on exactly.
 *
 * The "not yet exact" test is the whole point: promoting a term that already
 * has an exact target would just duplicate a bid against itself. Exact targets
 * are checked across the whole account, not only within the same campaign,
 * because a duplicate in another campaign is still a duplicate.
 */
export function harvestCandidates(
  rows: readonly SearchTermAggregate[],
  targets: readonly AdTarget[],
  config: AdConfig = DEFAULT_AD_CONFIG,
): HarvestCandidate[] {
  const exactExpressions = new Set(
    targets
      .filter((target) => target.matchType === 'exact')
      .map((target) => normalise(target.expression)),
  );

  const ceiling = config.targetAcos - config.harvestAcosMargin;

  return rows
    .filter((row) => {
      if (row.matchType === 'exact') return false;
      if (row.clicks < config.minimumClicksForConclusion) return false;
      if (row.adOrders === 0 || row.acos === null) return false;
      if (row.acos > ceiling) return false;
      return !exactExpressions.has(normalise(row.customerSearchTerm));
    })
    .map((row) => {
      const acosValue = row.acos ?? 0;
      return {
        customerSearchTerm: row.customerSearchTerm,
        sourceTargetId: row.targetId,
        sourceExpression: row.targetExpression,
        sourceMatchType: row.matchType,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        listingId: row.listingId,
        clicks: row.clicks,
        spendCents: row.spendCents,
        adSalesCents: row.adSalesCents,
        adOrders: row.adOrders,
        acos: acosValue,
        reason: `Shoppers searching “${row.customerSearchTerm}” reached this listing through the ${row.matchType} target “${row.targetExpression}” and converted at an ACOS of ${(acosValue * 100).toFixed(1)}%, against a target of ${(config.targetAcos * 100).toFixed(0)}%. There is no exact target for this phrase, so the bid on it is currently whatever the broader target happens to set.`,
        suggestedAction: `Consider adding “${row.customerSearchTerm}” as an exact target so it can carry its own bid, and watch whether its ACOS holds once it has one. This may improve control rather than volume — the term is already being served.`,
        evidence: `${row.clicks} clicks · ${row.adOrders} order(s) · ACOS ${(acosValue * 100).toFixed(1)}% · matched by ${row.matchType} target “${row.targetExpression}”`,
      };
    })
    .sort((a, b) => b.adSalesCents - a.adSalesCents);
}

/**
 * Search terms that have taken real clicks and real money and returned nothing.
 *
 * Two thresholds, both required: enough clicks that zero orders is meaningful,
 * and enough spend that acting is worth the effort. A term with 20 clicks and
 * 80 cents of spend is noise, not a finding.
 */
export function negationCandidates(
  rows: readonly SearchTermAggregate[],
  config: AdConfig = DEFAULT_AD_CONFIG,
): NegationCandidate[] {
  return rows
    .filter(
      (row) =>
        row.adOrders === 0 &&
        row.clicks >= config.minimumClicksForConclusion &&
        row.spendCents >= config.minimumSpendForNegationCents,
    )
    .map((row) => ({
      customerSearchTerm: row.customerSearchTerm,
      sourceTargetId: row.targetId,
      sourceExpression: row.targetExpression,
      sourceMatchType: row.matchType,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      listingId: row.listingId,
      clicks: row.clicks,
      spendCents: row.spendCents,
      reason: `“${row.customerSearchTerm}” has taken ${row.clicks} clicks through the ${row.matchType} target “${row.targetExpression}” and produced no orders at all. On this many clicks, zero is a result rather than an absence of data.`,
      suggestedAction: `Read the term before acting: if it describes a different product, adding it as a negative exact may stop the spend. If it describes this product in words the listing does not use, the listing copy may be the problem instead — negating it would hide a real gap.`,
      evidence: `${row.clicks} clicks · 0 orders · matched by ${row.matchType} target “${row.targetExpression}”`,
    }))
    .sort((a, b) => b.spendCents - a.spendCents);
}

/**
 * Terms that look bad but have not earned a verdict yet.
 *
 * Surfaced so the page can say "these were looked at and set aside", rather
 * than silently dropping them and leaving an operator to wonder why an
 * obviously wasteful term is missing from the list.
 */
export function inconclusiveTerms(
  rows: readonly SearchTermAggregate[],
  config: AdConfig = DEFAULT_AD_CONFIG,
): SearchTermAggregate[] {
  return rows
    .filter(
      (row) =>
        row.adOrders === 0 &&
        row.clicks > 0 &&
        row.clicks < config.minimumClicksForConclusion,
    )
    .sort((a, b) => b.spendCents - a.spendCents);
}

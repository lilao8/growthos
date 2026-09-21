/**
 * Amazon advertising configuration.
 *
 * What the numbers here are, stated plainly:
 *
 * - The target ACOS is a **business choice**, not a benchmark. A brand buying
 *   market share runs a deliberately high ACOS; one funding itself from cashflow
 *   runs a low one. This project picks a value so the rules have something to
 *   compare against, and says on screen that it is arbitrary.
 * - The minimum click and spend thresholds exist so nothing concludes from
 *   noise. A search term with four clicks and no sale has not proven anything.
 * - Nothing here is fetched, and nothing here changes a bid, a budget or a
 *   negative keyword. Every output is a suggestion for a person to act on.
 */

export const AD_RULE_VERSION = 'amazon-ads-1.0.0';

export interface AdConfig {
  /** Above this, a campaign or term is spending more than the brand intends. */
  targetAcos: number;
  /** Clicks needed before a term's conversion rate means anything at all. */
  minimumClicksForConclusion: number;
  /** Spend needed before a zero-order term is worth negating. */
  minimumSpendForNegationCents: number;
  /** A harvest candidate must beat the target ACOS by at least this margin. */
  harvestAcosMargin: number;
  /** Below this share of sales coming from outside ads, the ASIN leans on paid. */
  organicShareFloor: number;
  /** Buy box share below this is worth investigating. */
  buyBoxFloor: number;
}

export const DEFAULT_AD_CONFIG: AdConfig = {
  targetAcos: 0.3,
  minimumClicksForConclusion: 15,
  minimumSpendForNegationCents: 2500,
  harvestAcosMargin: 0.05,
  organicShareFloor: 0.4,
  buyBoxFloor: 0.9,
};

/**
 * Shown wherever an advertising number appears.
 *
 * The second sentence is the one that earns its place: ACOS and the
 * storefront's ROAS are reciprocals on paper and not comparable in practice,
 * and a workbench showing both has to say why.
 */
export const AD_DISCLAIMER =
  'Seeded demo data shaped like a Search Term Report and a Business Report. This project never calls the Amazon Advertising API or SP-API and never crawls. The target ACOS below is this project’s chosen figure, not an industry benchmark — a brand buying share runs a high ACOS on purpose.';

export const ACOS_VS_ROAS_NOTE =
  'ACOS and the storefront’s ROAS are arithmetic reciprocals — ROAS = 1 ÷ ACOS — but they are not comparable figures and this project never converts one into the other. They use different attribution windows, and ACOS covers only advertising-attributed sales while the storefront’s ROAS is measured against last-touch channel revenue. TACOS is the figure that accounts for organic sales alongside paid.';

export const CVR_DENOMINATOR_NOTE =
  'Conversion rate here is orders ÷ clicks. On the storefront it is purchasing sessions ÷ sessions. The denominators are different units, so the two numbers must never be read side by side as if they measured the same thing.';

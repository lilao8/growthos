import type { DateWindow } from '../demo-window';
import { isWithinWindow } from '../demo-window';
import { safeRatio, type MetricValue } from '../metrics';
import { sumCents } from '../money';
import type {
  AdCampaign,
  AdMatchType,
  AdTarget,
  AsinDailyReport,
  Cents,
  SearchTermRow,
} from '../types';
import { DEFAULT_AD_CONFIG, type AdConfig } from './ad-config';

/**
 * Amazon advertising metrics.
 *
 * Structurally this mirrors the storefront's channel metrics — same
 * sum-then-divide discipline, same null-for-empty-denominator rule — but it
 * shares no definition with it, deliberately:
 *
 * - **Conversion rate here is orders ÷ clicks.** On the storefront it is
 *   purchasing sessions ÷ sessions. Different denominators, different units.
 * - **ACOS is spend ÷ advertising-attributed sales**, the language Amazon
 *   operators actually use. It is never converted into ROAS for a side-by-side
 *   comparison; the attribution windows do not match.
 * - **TACOS is spend ÷ total sales**, which needs the Business Report as well
 *   as the ad report, because total sales include organic orders that no click
 *   was attributed to.
 *
 * As everywhere else: ratios are aggregated by summing numerators and
 * denominators first. Averaging per-day ACOS would weight a quiet Tuesday the
 * same as Prime Day.
 */

export interface AdTotals {
  window: DateWindow;
  impressions: number;
  clicks: number;
  spendCents: Cents;
  adSalesCents: Cents;
  adOrders: number;
  /** From the Business Report: everything sold, paid and organic together. */
  totalSalesCents: Cents;
  unitsOrdered: number;
  /** Amazon sessions. Never added to storefront sessions. */
  sessions: number;
  pageViews: number;
  acos: MetricValue;
  tacos: MetricValue;
  ctr: MetricValue;
  /** Orders ÷ clicks. NOT the storefront's session-based conversion rate. */
  cvr: MetricValue;
  cpcCents: MetricValue;
  /** (total sales − ad sales) ÷ total sales. */
  organicShare: MetricValue;
  unitSessionPercentage: MetricValue;
}

export interface CampaignRow {
  campaign: AdCampaign;
  impressions: number;
  clicks: number;
  spendCents: Cents;
  adSalesCents: Cents;
  adOrders: number;
  acos: MetricValue;
  ctr: MetricValue;
  cvr: MetricValue;
  cpcCents: MetricValue;
  /** True when too few clicks for the rates to mean anything. */
  lowVolume: boolean;
}

export interface SearchTermAggregate {
  customerSearchTerm: string;
  targetId: string;
  /** The target's own expression, so the pairing is visible, never implied. */
  targetExpression: string;
  matchType: AdMatchType;
  campaignId: string;
  campaignName: string;
  listingId: string;
  impressions: number;
  clicks: number;
  spendCents: Cents;
  adSalesCents: Cents;
  adOrders: number;
  acos: MetricValue;
  ctr: MetricValue;
  cvr: MetricValue;
  cpcCents: MetricValue;
  lowVolume: boolean;
}

export interface AsinAdRow {
  listingId: string;
  sessions: number;
  pageViews: number;
  unitsOrdered: number;
  totalSalesCents: Cents;
  adSalesCents: Cents;
  spendCents: Cents;
  acos: MetricValue;
  tacos: MetricValue;
  organicShare: MetricValue;
  unitSessionPercentage: MetricValue;
  /** Mean buy box share across reported days, or null when no days reported. */
  buyBoxPercentage: MetricValue;
}

export interface AdDailyPoint {
  date: string;
  spendCents: Cents;
  adSalesCents: Cents;
  clicks: number;
  acos: MetricValue;
}

export interface AdMetricsInput {
  campaigns: readonly AdCampaign[];
  targets: readonly AdTarget[];
  searchTerms: readonly SearchTermRow[];
  reports: readonly AsinDailyReport[];
  window: DateWindow;
  config?: AdConfig;
}

interface Counters {
  impressions: number;
  clicks: number;
  spendCents: number;
  adSalesCents: number;
  adOrders: number;
}

const EMPTY: Counters = {
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  adSalesCents: 0,
  adOrders: 0,
};

function addRow(into: Counters, row: SearchTermRow): Counters {
  return {
    impressions: into.impressions + row.impressions,
    clicks: into.clicks + row.clicks,
    spendCents: into.spendCents + row.spendCents,
    adSalesCents: into.adSalesCents + row.adSalesCents,
    adOrders: into.adOrders + row.adOrders,
  };
}

/** Advertising cost of sale: spend ÷ advertising-attributed sales. */
export function acos(spendCents: Cents, adSalesCents: Cents): MetricValue {
  return safeRatio(spendCents, adSalesCents);
}

/** Total advertising cost of sale: spend ÷ all sales, paid and organic. */
export function tacos(spendCents: Cents, totalSalesCents: Cents): MetricValue {
  return safeRatio(spendCents, totalSalesCents);
}

export function clickThroughRate(
  clicks: number,
  impressions: number,
): MetricValue {
  return safeRatio(clicks, impressions);
}

/**
 * Orders ÷ clicks.
 *
 * Named apart from the storefront's `conversionRate` on purpose: the two take
 * different denominators and a shared name would invite someone to put them in
 * the same column one day.
 */
export function clickConversionRate(
  adOrders: number,
  clicks: number,
): MetricValue {
  return safeRatio(adOrders, clicks);
}

export function costPerClick(spendCents: Cents, clicks: number): MetricValue {
  return safeRatio(spendCents, clicks);
}

/** Share of sales that no advertising click was attributed to. */
export function organicShare(
  totalSalesCents: Cents,
  adSalesCents: Cents,
): MetricValue {
  // Attributed sales can exceed same-day total sales, because Amazon credits a
  // click to the day of the click rather than the day of the order. Clamping at
  // zero would hide that; reporting the negative share would imply a precision
  // the data does not have. Null says "this window cannot answer it".
  if (totalSalesCents <= 0) return null;
  if (adSalesCents > totalSalesCents) return null;
  return safeRatio(totalSalesCents - adSalesCents, totalSalesCents);
}

/** Units ÷ Amazon sessions, the Business Report's own headline rate. */
export function unitSessionPercentage(
  unitsOrdered: number,
  sessions: number,
): MetricValue {
  return safeRatio(unitsOrdered, sessions);
}

function inWindow<T extends { date: string }>(
  rows: readonly T[],
  window: DateWindow,
): T[] {
  return rows.filter((row) => isWithinWindow(row.date, window));
}

export function adTotals(input: AdMetricsInput): AdTotals {
  const { window } = input;
  const terms = inWindow(input.searchTerms, window);
  const reports = inWindow(input.reports, window);

  const counters = terms.reduce(addRow, EMPTY);
  const totalSalesCents = sumCents(reports.map((row) => row.totalSalesCents));
  const unitsOrdered = reports.reduce((sum, row) => sum + row.unitsOrdered, 0);
  const sessions = reports.reduce((sum, row) => sum + row.sessions, 0);
  const pageViews = reports.reduce((sum, row) => sum + row.pageViews, 0);

  return {
    window,
    ...counters,
    totalSalesCents,
    unitsOrdered,
    sessions,
    pageViews,
    acos: acos(counters.spendCents, counters.adSalesCents),
    tacos: tacos(counters.spendCents, totalSalesCents),
    ctr: clickThroughRate(counters.clicks, counters.impressions),
    cvr: clickConversionRate(counters.adOrders, counters.clicks),
    cpcCents: costPerClick(counters.spendCents, counters.clicks),
    organicShare: organicShare(totalSalesCents, counters.adSalesCents),
    unitSessionPercentage: unitSessionPercentage(unitsOrdered, sessions),
  };
}

export function campaignRows(input: AdMetricsInput): CampaignRow[] {
  const config = input.config ?? DEFAULT_AD_CONFIG;
  const terms = inWindow(input.searchTerms, input.window);
  const targetToCampaign = new Map(
    input.targets.map((target) => [target.id, target.campaignId]),
  );

  const byCampaign = new Map<string, Counters>();
  for (const row of terms) {
    const campaignId = targetToCampaign.get(row.targetId);
    if (campaignId === undefined) continue;
    byCampaign.set(campaignId, addRow(byCampaign.get(campaignId) ?? EMPTY, row));
  }

  return input.campaigns
    .map((campaign) => {
      const counters = byCampaign.get(campaign.id) ?? EMPTY;
      return {
        campaign,
        ...counters,
        acos: acos(counters.spendCents, counters.adSalesCents),
        ctr: clickThroughRate(counters.clicks, counters.impressions),
        cvr: clickConversionRate(counters.adOrders, counters.clicks),
        cpcCents: costPerClick(counters.spendCents, counters.clicks),
        lowVolume: counters.clicks < config.minimumClicksForConclusion,
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents);
}

/**
 * One row per (search term, target) pair.
 *
 * Not per search term alone: the same shopper query can be matched by a broad
 * target in one campaign and an exact target in another, and those are
 * genuinely different rows with different bids. Collapsing them would hide the
 * duplication that harvesting exists to resolve.
 */
export function searchTermRows(input: AdMetricsInput): SearchTermAggregate[] {
  const config = input.config ?? DEFAULT_AD_CONFIG;
  const terms = inWindow(input.searchTerms, input.window);
  const targetsById = new Map(input.targets.map((target) => [target.id, target]));
  const campaignsById = new Map(
    input.campaigns.map((campaign) => [campaign.id, campaign]),
  );

  const grouped = new Map<string, Counters>();
  for (const row of terms) {
    const key = `${row.targetId} ${row.customerSearchTerm}`;
    grouped.set(key, addRow(grouped.get(key) ?? EMPTY, row));
  }

  const rows: SearchTermAggregate[] = [];
  for (const [key, counters] of grouped) {
    const [targetId = '', customerSearchTerm = ''] = key.split(' ');
    const target = targetsById.get(targetId);
    if (target === undefined) continue;
    const campaign = campaignsById.get(target.campaignId);
    if (campaign === undefined) continue;

    rows.push({
      customerSearchTerm,
      targetId,
      targetExpression: target.expression,
      matchType: target.matchType,
      campaignId: campaign.id,
      campaignName: campaign.name,
      listingId: campaign.listingId,
      ...counters,
      acos: acos(counters.spendCents, counters.adSalesCents),
      ctr: clickThroughRate(counters.clicks, counters.impressions),
      cvr: clickConversionRate(counters.adOrders, counters.clicks),
      cpcCents: costPerClick(counters.spendCents, counters.clicks),
      lowVolume: counters.clicks < config.minimumClicksForConclusion,
    });
  }

  return rows.sort(
    (a, b) =>
      b.spendCents - a.spendCents ||
      a.customerSearchTerm.localeCompare(b.customerSearchTerm),
  );
}

export function asinRows(input: AdMetricsInput): AsinAdRow[] {
  const terms = inWindow(input.searchTerms, input.window);
  const reports = inWindow(input.reports, input.window);
  const targetToListing = new Map<string, string>();
  const campaignsById = new Map(
    input.campaigns.map((campaign) => [campaign.id, campaign]),
  );
  for (const target of input.targets) {
    const campaign = campaignsById.get(target.campaignId);
    if (campaign !== undefined) {
      targetToListing.set(target.id, campaign.listingId);
    }
  }

  const adByListing = new Map<string, Counters>();
  for (const row of terms) {
    const listingId = targetToListing.get(row.targetId);
    if (listingId === undefined) continue;
    adByListing.set(listingId, addRow(adByListing.get(listingId) ?? EMPTY, row));
  }

  const reportByListing = new Map<string, AsinDailyReport[]>();
  for (const report of reports) {
    const bucket = reportByListing.get(report.listingId) ?? [];
    bucket.push(report);
    reportByListing.set(report.listingId, bucket);
  }

  const listingIds = new Set([...reportByListing.keys(), ...adByListing.keys()]);

  return [...listingIds]
    .map((listingId) => {
      const ads = adByListing.get(listingId) ?? EMPTY;
      const days = reportByListing.get(listingId) ?? [];
      const sessions = days.reduce((sum, row) => sum + row.sessions, 0);
      const pageViews = days.reduce((sum, row) => sum + row.pageViews, 0);
      const unitsOrdered = days.reduce((sum, row) => sum + row.unitsOrdered, 0);
      const totalSalesCents = sumCents(days.map((row) => row.totalSalesCents));

      return {
        listingId,
        sessions,
        pageViews,
        unitsOrdered,
        totalSalesCents,
        adSalesCents: ads.adSalesCents,
        spendCents: ads.spendCents,
        acos: acos(ads.spendCents, ads.adSalesCents),
        tacos: tacos(ads.spendCents, totalSalesCents),
        organicShare: organicShare(totalSalesCents, ads.adSalesCents),
        unitSessionPercentage: unitSessionPercentage(unitsOrdered, sessions),
        // A mean of daily shares: each reported day counts once, which is the
        // right weighting for a share that is already a per-day percentage.
        buyBoxPercentage:
          days.length === 0
            ? null
            : days.reduce((sum, row) => sum + row.buyBoxPercentage, 0) /
              days.length,
      };
    })
    .sort((a, b) => b.totalSalesCents - a.totalSalesCents);
}

export function adDaily(input: AdMetricsInput): AdDailyPoint[] {
  const terms = inWindow(input.searchTerms, input.window);
  const byDate = new Map<string, Counters>();
  for (const row of terms) {
    byDate.set(row.date, addRow(byDate.get(row.date) ?? EMPTY, row));
  }

  return [...byDate.entries()]
    .map(([date, counters]) => ({
      date,
      spendCents: counters.spendCents,
      adSalesCents: counters.adSalesCents,
      clicks: counters.clicks,
      acos: acos(counters.spendCents, counters.adSalesCents),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

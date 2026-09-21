import { DEMO_WINDOW, type DateWindow } from '@/domain/demo-window';
import {
  adDaily,
  adTotals,
  asinRows,
  campaignRows,
  searchTermRows,
  type AdDailyPoint,
  type AdMetricsInput,
  type AdTotals,
  type AsinAdRow,
  type CampaignRow,
  type SearchTermAggregate,
} from '@/domain/amazon/ad-metrics';
import {
  harvestCandidates,
  inconclusiveTerms,
  negationCandidates,
  type HarvestCandidate,
  type NegationCandidate,
} from '@/domain/amazon/harvest';
import {
  AD_RULE_VERSION,
  DEFAULT_AD_CONFIG,
  type AdConfig,
} from '@/domain/amazon/ad-config';
import type { AmazonAdsRepository } from '@/repositories/amazon-ads-repository';
import type { DemoStateRepository } from '@/repositories/types';
import type { AmazonListing, Product } from '@/domain/types';

/**
 * Amazon advertising service.
 *
 * Reads the report repositories, runs the pure engines, and hands the page a
 * ready-to-render result. It reads no storefront sessions, orders or spend, and
 * nothing it returns is ever added to a storefront metric.
 */

export interface AmazonAdsDeps {
  ads: AmazonAdsRepository;
  /** Only for listing and product names — never for storefront metrics. */
  state: DemoStateRepository;
  window?: DateWindow;
  config?: AdConfig;
}

/** A listing label, so a row is identifiable without exposing an internal id. */
export interface ListingLabel {
  listingId: string;
  asin: string;
  title: string;
}

export interface AsinAdRowView extends AsinAdRow {
  label: ListingLabel | null;
  /** True when this ASIN sells mostly through advertising. */
  lowOrganicShare: boolean;
}

export interface AdvertisingView {
  totals: AdTotals;
  campaigns: CampaignRow[];
  searchTerms: SearchTermAggregate[];
  asins: AsinAdRowView[];
  daily: AdDailyPoint[];
  harvest: HarvestCandidate[];
  negations: NegationCandidate[];
  /** Zero-order terms that have not earned a verdict yet. */
  inconclusive: SearchTermAggregate[];
  /** Campaigns spending above the configured target ACOS. */
  overTargetCampaigns: CampaignRow[];
  config: AdConfig;
  ruleVersion: string;
  labels: Map<string, ListingLabel>;
}

export type AdvertisingState =
  | { status: 'ready'; view: AdvertisingView }
  | { status: 'empty'; window: DateWindow }
  | { status: 'error'; message: string };

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function buildLabels(
  listings: readonly AmazonListing[],
  products: readonly Product[],
): Map<string, ListingLabel> {
  const byProduct = new Map(products.map((product) => [product.id, product]));
  return new Map(
    listings.map((listing) => [
      listing.id,
      {
        listingId: listing.id,
        asin: listing.asin,
        title: byProduct.get(listing.productId)?.title ?? listing.asin,
      },
    ]),
  );
}

export async function loadAdvertising(
  deps: AmazonAdsDeps,
): Promise<AdvertisingState> {
  const window = deps.window ?? DEMO_WINDOW;
  const config = deps.config ?? DEFAULT_AD_CONFIG;

  let ads;
  let listings: AmazonListing[] = [];
  let products: Product[] = [];
  try {
    const [adsResult, stateResult] = await Promise.all([
      deps.ads.load(),
      deps.state.load(),
    ]);
    ads = adsResult;
    listings = stateResult.state.amazonListings;
    products = stateResult.state.products;
  } catch (cause) {
    return {
      status: 'error',
      message: messageFrom(cause, 'Could not load Amazon advertising data.'),
    };
  }

  const input: AdMetricsInput = {
    campaigns: ads.campaigns,
    targets: ads.targets,
    searchTerms: ads.searchTerms,
    reports: ads.reports,
    window,
    config,
  };

  const totals = adTotals(input);
  if (totals.impressions === 0 && totals.sessions === 0) {
    return { status: 'empty', window };
  }

  const labels = buildLabels(listings, products);
  const terms = searchTermRows(input);
  const campaigns = campaignRows(input);

  const asins: AsinAdRowView[] = asinRows(input).map((row) => ({
    ...row,
    label: labels.get(row.listingId) ?? null,
    lowOrganicShare:
      row.organicShare !== null && row.organicShare < config.organicShareFloor,
  }));

  return {
    status: 'ready',
    view: {
      totals,
      campaigns,
      searchTerms: terms,
      asins,
      daily: adDaily(input),
      harvest: harvestCandidates(terms, ads.targets, config),
      negations: negationCandidates(terms, config),
      inconclusive: inconclusiveTerms(terms, config),
      overTargetCampaigns: campaigns.filter(
        (row) =>
          row.acos !== null && row.acos > config.targetAcos && !row.lowVolume,
      ),
      config,
      ruleVersion: AD_RULE_VERSION,
      labels,
    },
  };
}

export type ListingAdvertisingState =
  | { status: 'ready'; row: AsinAdRowView; config: AdConfig }
  | { status: 'none' }
  | { status: 'error'; message: string };

/**
 * The advertising figures for one listing.
 *
 * `none` is a real answer, not a failure: most ASINs in the catalogue are not
 * advertised, and a listing with no campaign should say so rather than show
 * zeros that look like poor performance.
 */
export async function loadListingAdvertising(
  deps: AmazonAdsDeps,
  listingId: string,
): Promise<ListingAdvertisingState> {
  const state = await loadAdvertising(deps);
  if (state.status === 'error') {
    return { status: 'error', message: state.message };
  }
  if (state.status === 'empty') return { status: 'none' };

  const row = state.view.asins.find((item) => item.listingId === listingId);
  if (row === undefined) return { status: 'none' };
  return { status: 'ready', row, config: state.view.config };
}

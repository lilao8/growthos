import { addDays, DEMO_WINDOW } from '@/domain/demo-window';
import { createRandomSource, randomInt } from '@/domain/seed';
import type {
  AdCampaign,
  AdTarget,
  AsinDailyReport,
  SearchTermRow,
} from '@/domain/types';

/**
 * Seeded Search Term Report and Business Report data.
 *
 * Eight of the seventeen listings are advertised, which is itself realistic —
 * nobody runs campaigns on everything. Every figure is derived from a fixed
 * seed, so the same numbers appear on every machine and in every test run.
 *
 * The findings are authored, not emergent. Each is here to exercise one branch
 * of the rules:
 *
 * - Two harvest candidates: high-converting search terms found by broad and
 *   auto targets that have no exact target of their own.
 * - One term that converts well but ALREADY has an exact target — it must not
 *   be harvested, or the suggestion would be to duplicate an existing bid.
 * - Two negation candidates: real clicks, real spend, zero orders. One of them
 *   describes a different product; the other describes this product in words
 *   the listing does not use, which is a listing problem rather than a negative
 *   keyword. The copy says so.
 * - Several zero-order terms below the click threshold, which must produce no
 *   conclusion at all.
 * - One campaign far above target ACOS, and one ASIN leaning heavily on paid
 *   sales.
 *
 * Nothing is fetched. This project never calls the Amazon Advertising API.
 */

const WINDOW = DEMO_WINDOW;
const ADS_SEED = 20260831 + 11;

interface CampaignSeed {
  id: string;
  name: string;
  listingId: string;
  targetingType: AdCampaign['targetingType'];
  dailyBudgetCents: number;
  /** Rough daily impression volume; the generator varies around it. */
  impressionsPerDay: number;
  /** Baseline click-through, as a share. */
  ctr: number;
  /** Baseline orders per click for this campaign's own targets. */
  cvr: number;
  /** Average order value in cents, used to derive attributed sales. */
  aovCents: number;
  /**
   * The ACOS this campaign is authored to land near. The cost per click is
   * derived from it rather than chosen independently, because ACOS, CVR, AOV
   * and CPC are one equation — picking all four separately produces figures
   * that cannot happen (a 4% ACOS on a $329 product with a 76c CPC implies a
   * conversion rate no marketplace listing achieves).
   */
  intendedAcos: number;
  targets: TargetSeed[];
}

interface TargetSeed {
  id: string;
  expression: string;
  matchType: AdTarget['matchType'];
  /** Share of the campaign's traffic this target takes. */
  share: number;
  /** Search terms this target matches, with their share of the target. */
  terms: TermSeed[];
}

interface TermSeed {
  text: string;
  share: number;
  /** Multiplier on the campaign's baseline conversion rate. */
  cvrFactor: number;
  /**
   * Share of days this term appears at all. A rare query genuinely accumulates
   * only a handful of clicks across the window, which is what keeps it below
   * the conclusion threshold instead of being forced there by a tiny share.
   */
  dayShare?: number;
}

const CAMPAIGNS: readonly CampaignSeed[] = [
  {
    id: 'cmp_ridgeline_2p_exact',
    name: 'Ridgeline 2P — Exact',
    listingId: 'lst_ridgeline_2p_tent',
    targetingType: 'manual',
    dailyBudgetCents: 4500,
    impressionsPerDay: 1900,
    ctr: 0.004,
    cvr: 0.045,
    aovCents: 32900,
    intendedAcos: 0.22,
    targets: [
      {
        id: 'tgt_r2p_two_person_tent',
        expression: 'two person backpacking tent',
        matchType: 'exact',
        share: 0.62,
        terms: [{ text: 'two person backpacking tent', share: 1, cvrFactor: 1.15 }],
      },
      {
        id: 'tgt_r2p_2p_tent',
        expression: '2 person tent',
        matchType: 'exact',
        share: 0.38,
        terms: [{ text: '2 person tent', share: 1, cvrFactor: 0.95 }],
      },
    ],
  },
  {
    id: 'cmp_ridgeline_2p_broad',
    name: 'Ridgeline 2P — Broad discovery',
    listingId: 'lst_ridgeline_2p_tent',
    targetingType: 'manual',
    dailyBudgetCents: 3000,
    impressionsPerDay: 2600,
    ctr: 0.0032,
    cvr: 0.022,
    aovCents: 32900,
    intendedAcos: 0.34,
    targets: [
      {
        id: 'tgt_r2p_broad_tent',
        expression: 'backpacking tent',
        matchType: 'broad',
        share: 1,
        terms: [
          // Harvest candidate: converts well, no exact target anywhere.
          { text: 'freestanding 2 person tent', share: 0.2, cvrFactor: 2.1 },
          // Converts well ENOUGH TO HARVEST but tgt_r2p_2p_tent already targets
          // it exactly. Its ACOS must sit below the harvest ceiling, or the
          // exact-target exclusion would never actually be exercised — the
          // term would be filtered out by its ACOS instead and the test would
          // pass for the wrong reason.
          { text: '2 person tent', share: 0.16, cvrFactor: 3.4 },
          // Negation candidate: a different product entirely.
          { text: 'tent stove jack', share: 0.16, cvrFactor: 0 },
          { text: 'lightweight hiking tent', share: 0.2, cvrFactor: 0.85 },
          { text: 'tent for two adults', share: 0.16, cvrFactor: 0.7 },
          // Below the click threshold: no conclusion may be drawn.
          { text: 'canvas bell tent', share: 0.06, cvrFactor: 0, dayShare: 0.12 },
          { text: 'tent repair kit', share: 0.06, cvrFactor: 0, dayShare: 0.1 },
        ],
      },
    ],
  },
  {
    id: 'cmp_summit0_auto',
    name: 'Summit 0 — Auto',
    listingId: 'lst_summit_0_bag',
    targetingType: 'auto',
    dailyBudgetCents: 3500,
    impressionsPerDay: 2100,
    ctr: 0.0036,
    cvr: 0.03,
    aovCents: 46900,
    intendedAcos: 0.28,
    targets: [
      {
        id: 'tgt_s0_auto_close',
        expression: 'close match',
        matchType: 'auto',
        share: 1,
        terms: [
          // Harvest candidate.
          { text: '0 degree sleeping bag', share: 0.24, cvrFactor: 2.2 },
          { text: 'winter sleeping bag', share: 0.22, cvrFactor: 1 },
          { text: 'down mummy bag', share: 0.18, cvrFactor: 0.8 },
          // Negation candidate: the listing is a bag, not a bag liner.
          { text: 'sleeping bag liner fleece', share: 0.18, cvrFactor: 0 },
          { text: 'expedition sleeping bag', share: 0.12, cvrFactor: 0.95 },
          { text: 'sleeping bag for kids', share: 0.06, cvrFactor: 0, dayShare: 0.11 },
        ],
      },
    ],
  },
  {
    id: 'cmp_cloudbed_exact',
    name: 'Cloudbed Pad — Exact',
    listingId: 'lst_cloudbed_pad',
    targetingType: 'manual',
    dailyBudgetCents: 2800,
    impressionsPerDay: 1500,
    ctr: 0.0042,
    cvr: 0.075,
    aovCents: 14900,
    intendedAcos: 0.24,
    targets: [
      {
        id: 'tgt_cb_sleeping_pad',
        expression: 'insulated sleeping pad',
        matchType: 'exact',
        share: 1,
        terms: [{ text: 'insulated sleeping pad', share: 1, cvrFactor: 1.2 }],
      },
    ],
  },
  {
    id: 'cmp_traverse55_phrase',
    name: 'Traverse 55 — Phrase',
    listingId: 'lst_traverse_55',
    targetingType: 'manual',
    dailyBudgetCents: 3200,
    impressionsPerDay: 1800,
    ctr: 0.0035,
    cvr: 0.042,
    aovCents: 23900,
    intendedAcos: 0.3,
    targets: [
      {
        id: 'tgt_t55_phrase_pack',
        expression: 'backpacking pack 55l',
        matchType: 'phrase',
        share: 1,
        terms: [
          { text: '55l backpacking pack', share: 0.34, cvrFactor: 1.15 },
          { text: 'hiking backpack 55 liter', share: 0.3, cvrFactor: 0.9 },
          { text: 'multi day hiking pack', share: 0.24, cvrFactor: 0.75 },
          { text: 'school backpack 55l', share: 0.12, cvrFactor: 0, dayShare: 0.14 },
        ],
      },
    ],
  },
  {
    id: 'cmp_emberlite_stove',
    name: 'Emberlite Stove — Exact',
    listingId: 'lst_emberlite_stove',
    targetingType: 'manual',
    dailyBudgetCents: 2600,
    impressionsPerDay: 1700,
    ctr: 0.0045,
    cvr: 0.11,
    aovCents: 5900,
    intendedAcos: 0.21,
    targets: [
      {
        id: 'tgt_em_camp_stove',
        expression: 'backpacking stove',
        matchType: 'exact',
        share: 1,
        terms: [{ text: 'backpacking stove', share: 1, cvrFactor: 1.1 }],
      },
    ],
  },
  {
    // Deliberately inefficient: high bid, weak conversion, ACOS far over target.
    id: 'cmp_rain_shell_broad',
    name: 'Rain Shell — Broad',
    listingId: 'lst_ridgeline_rain_shell',
    targetingType: 'manual',
    dailyBudgetCents: 3800,
    impressionsPerDay: 2400,
    ctr: 0.0029,
    cvr: 0.02,
    aovCents: 18900,
    intendedAcos: 0.52,
    targets: [
      {
        id: 'tgt_rs_broad_jacket',
        expression: 'rain jacket',
        matchType: 'broad',
        share: 1,
        terms: [
          { text: 'waterproof hiking jacket', share: 0.3, cvrFactor: 1.2 },
          { text: 'mens rain jacket', share: 0.28, cvrFactor: 0.9 },
          { text: 'packable rain shell', share: 0.22, cvrFactor: 1.1 },
          // A real gap rather than a bad term: the listing never says "poncho",
          // and the copy on screen says to check the listing before negating.
          { text: 'rain poncho hiking', share: 0.2, cvrFactor: 0 },
        ],
      },
    ],
  },
  {
    // Sells almost entirely through ads: a low organic share by construction.
    id: 'cmp_beacon_headlamp',
    name: 'Beacon 400 — Exact',
    listingId: 'lst_beacon_headlamp',
    targetingType: 'manual',
    dailyBudgetCents: 3000,
    impressionsPerDay: 2000,
    ctr: 0.004,
    cvr: 0.095,
    aovCents: 4900,
    intendedAcos: 0.33,
    targets: [
      {
        id: 'tgt_bc_headlamp',
        expression: 'rechargeable headlamp',
        matchType: 'exact',
        share: 1,
        terms: [{ text: 'rechargeable headlamp', share: 1, cvrFactor: 1.05 }],
      },
    ],
  },
];

/**
 * Total sales as a multiple of advertising-attributed sales.
 *
 * 1.0 would mean every sale came through an ad click. The Beacon headlamp sits
 * just above that on purpose: it is the ASIN carried almost entirely by paid
 * traffic, which is what the organic-share rule exists to surface.
 */
const TOTAL_SALES_MULTIPLIER: Record<string, number> = {
  lst_ridgeline_2p_tent: 2.4,
  lst_summit_0_bag: 2.1,
  lst_cloudbed_pad: 2.8,
  lst_traverse_55: 2.2,
  lst_emberlite_stove: 3.1,
  lst_ridgeline_rain_shell: 1.9,
  // Barely any organic demand: this ASIN is carried by advertising.
  lst_beacon_headlamp: 1.15,
};

/** Average order value per listing, used to derive units from sales. */
const LISTING_AOV_CENTS: Record<string, number> = {
  lst_ridgeline_2p_tent: 32900,
  lst_summit_0_bag: 46900,
  lst_cloudbed_pad: 14900,
  lst_traverse_55: 23900,
  lst_emberlite_stove: 5900,
  lst_ridgeline_rain_shell: 18900,
  lst_beacon_headlamp: 4900,
};

function windowDates(): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < WINDOW.days; offset += 1) {
    dates.push(addDays(WINDOW.start, offset));
  }
  return dates;
}

/** Weekend lift, so the daily chart is not a flat line. */
function dayFactor(date: string): number {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? 1.18 : 0.97;
}

interface AdsFixture {
  campaigns: AdCampaign[];
  targets: AdTarget[];
  searchTerms: SearchTermRow[];
  reports: AsinDailyReport[];
}

function build(): AdsFixture {
  const random = createRandomSource(ADS_SEED);
  const dates = windowDates();

  const campaigns: AdCampaign[] = CAMPAIGNS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    type: 'SP',
    targetingType: seed.targetingType,
    listingId: seed.listingId,
    dailyBudgetCents: seed.dailyBudgetCents,
    status: 'enabled',
  }));

  // ACOS = CPC ÷ (CVR × AOV), so the cost per click follows from the other
  // three rather than being chosen independently.
  const baselineCpc = (campaign: CampaignSeed): number =>
    Math.round(campaign.intendedAcos * campaign.cvr * campaign.aovCents);

  const targets: AdTarget[] = CAMPAIGNS.flatMap((campaign) =>
    campaign.targets.map((target) => ({
      id: target.id,
      campaignId: campaign.id,
      expression: target.expression,
      matchType: target.matchType,
      // The bid sits a little above the realised cost per click, as it does in
      // a real account where you rarely pay your full bid.
      bidCents: Math.round(baselineCpc(campaign) * 1.15),
    })),
  );

  const searchTerms: SearchTermRow[] = [];
  // Ad sales per listing per date, so the Business Report can be built on top
  // of them rather than invented independently — total sales must always be at
  // least the attributed sales, or the organic share would be negative.
  const adSalesByListingDate = new Map<string, number>();

  for (const date of dates) {
    const factor = dayFactor(date);

    for (const campaign of CAMPAIGNS) {
      const campaignImpressions = Math.round(
        campaign.impressionsPerDay * factor * (0.85 + random.next() * 0.3),
      );

      for (const target of campaign.targets) {
        const targetImpressions = Math.round(campaignImpressions * target.share);

        for (const term of target.terms) {
          // A rare query simply does not appear on most days.
          if (term.dayShare !== undefined && random.next() > term.dayShare) {
            continue;
          }

          const impressions = Math.round(targetImpressions * term.share);
          if (impressions <= 0) continue;

          const clicks = Math.round(
            impressions * campaign.ctr * (0.8 + random.next() * 0.4),
          );
          if (clicks <= 0) continue;

          const cpc = Math.round(
            baselineCpc(campaign) * (0.85 + random.next() * 0.3),
          );
          const spendCents = clicks * cpc;

          // Expected orders can be fractional; the remainder becomes a
          // probability so small-volume terms still convert occasionally
          // instead of always rounding to zero.
          const expected = clicks * campaign.cvr * term.cvrFactor;
          const whole = Math.floor(expected);
          const adOrders =
            whole + (random.next() < expected - whole ? 1 : 0);
          const adSalesCents =
            adOrders === 0
              ? 0
              : adOrders *
                Math.round(campaign.aovCents * (0.92 + random.next() * 0.16));

          searchTerms.push({
            date,
            targetId: target.id,
            customerSearchTerm: term.text,
            impressions,
            clicks,
            spendCents,
            adSalesCents,
            adOrders,
          });

          const key = `${campaign.listingId}\u0000${date}`;
          adSalesByListingDate.set(
            key,
            (adSalesByListingDate.get(key) ?? 0) + adSalesCents,
          );
        }
      }
    }
  }

  const advertisedListings = [
    ...new Set(CAMPAIGNS.map((campaign) => campaign.listingId)),
  ];

  const reports: AsinDailyReport[] = [];
  for (const listingId of advertisedListings) {
    const multiplier = TOTAL_SALES_MULTIPLIER[listingId] ?? 2;
    const aov = LISTING_AOV_CENTS[listingId] ?? 20000;
    for (const date of dates) {
      const adSales = adSalesByListingDate.get(`${listingId}\u0000${date}`) ?? 0;
      // Total sales are built from attributed sales, so the two always
      // reconcile: total >= attributed by construction. The organic portion is
      // proportional rather than a flat daily amount — a flat figure would
      // dominate a low-revenue ASIN and quietly destroy the low-organic-share
      // case this fixture exists to demonstrate.
      const totalSalesCents = Math.round(
        adSales * multiplier * (0.9 + random.next() * 0.2),
      );
      // Units follow from sales at this listing's own price point, so unit
      // session percentage cannot contradict the revenue on the same row.
      const unitsOrdered =
        totalSalesCents === 0
          ? 0
          : Math.max(1, Math.round(totalSalesCents / aov));
      // Sessions follow from units at a plausible unit session percentage,
      // rather than being drawn independently and producing a rate no
      // marketplace listing actually sees.
      const sessions =
        unitsOrdered === 0
          ? randomInt(random, 4, 20)
          : Math.max(
              unitsOrdered,
              Math.round(unitsOrdered / (0.07 + random.next() * 0.06)),
            );
      const pageViews =
        sessions + randomInt(random, 2, Math.max(3, Math.round(sessions * 0.3)));

      reports.push({
        date,
        listingId,
        sessions,
        pageViews,
        unitsOrdered,
        totalSalesCents,
        buyBoxPercentage:
          listingId === 'lst_summit_20_bag'
            ? 0.6 + random.next() * 0.1
            : 0.9 + random.next() * 0.09,
      });
    }
  }

  return { campaigns, targets, searchTerms, reports };
}

let cached: AdsFixture | null = null;

/** Built once and reused; the generator is pure, so this is a cache not state. */
export function getAmazonAdsFixture(): AdsFixture {
  cached ??= build();
  return cached;
}

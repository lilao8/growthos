import { addDays, DEMO_WINDOW, type DateWindow } from '@/domain/demo-window';
import { apportionCents, sumCents } from '@/domain/money';
import { createRandomSource, DEMO_SEED, type RandomSource } from '@/domain/seed';
import type {
  Channel,
  ChannelSpend,
  FunnelStage,
  Order,
  OrderItem,
  Product,
  SessionFact,
} from '@/domain/types';
import { buildDemoSeedState } from './demo-seed';
import { catalogueDemandWeights, snapshotIdFor } from './demo-catalogue';

/**
 * Deterministic traffic fixture.
 *
 * One data set feeds every module: the dashboard, product metrics, channel
 * analytics and the funnel all read these same sessions, orders and spend
 * records, so the numbers cannot disagree between screens.
 *
 * Nothing here calls Math.random(). The same seed always produces the same
 * sessions, so every screen shows identical numbers on every machine and reload.
 */

const BASE_SESSIONS_PER_DAY = 95;

/** Weekday index 0 = Sunday. Outdoor gear browses heavier at the weekend. */
const WEEKDAY_FACTORS = [1.18, 0.88, 0.9, 0.92, 0.96, 1.05, 1.22] as const;

interface ChannelProfile {
  channel: Channel;
  weight: number;
  sources: readonly string[];
  /** Multiplier on purchase intent. Intent-led channels convert better. */
  intent: number;
  /**
   * Media cost per session, in cents. Only channels a brand actually buys have
   * one. Feeds ROAS.
   */
  adCostPerSessionCents: number;
  /**
   * Non-media acquisition cost per session, in cents — an email platform fee,
   * an affiliate payout. Added to ad cost to give acquisition spend, which
   * feeds CAC. A channel with neither has no CAC and no ROAS, and both are
   * reported as N/A rather than invented.
   */
  extraAcquisitionCostPerSessionCents: number;
}

const CHANNEL_PROFILES: readonly ChannelProfile[] = [
  // Earned channels: no media cost, so no ROAS and no CAC.
  {
    channel: 'Organic Search',
    weight: 34,
    sources: ['google', 'bing'],
    intent: 1.1,
    adCostPerSessionCents: 0,
    extraAcquisitionCostPerSessionCents: 0,
  },
  {
    channel: 'Direct',
    weight: 15,
    sources: ['(direct)'],
    intent: 1.15,
    adCostPerSessionCents: 0,
    extraAcquisitionCostPerSessionCents: 0,
  },
  // Bought channels: media cost, so both ROAS and CAC apply.
  {
    channel: 'Paid Search',
    weight: 12,
    sources: ['google-ads'],
    intent: 1.0,
    adCostPerSessionCents: 105,
    extraAcquisitionCostPerSessionCents: 0,
  },
  {
    channel: 'Meta',
    weight: 12,
    sources: ['facebook', 'instagram'],
    intent: 0.72,
    adCostPerSessionCents: 135,
    extraAcquisitionCostPerSessionCents: 0,
  },
  // Owned channel: a platform fee but no media buy, so CAC applies and ROAS
  // does not — dividing revenue by zero ad spend would be meaningless.
  {
    channel: 'Email',
    weight: 9,
    sources: ['klaviyo'],
    intent: 1.3,
    adCostPerSessionCents: 0,
    extraAcquisitionCostPerSessionCents: 8,
  },
  {
    channel: 'TikTok',
    weight: 8,
    sources: ['tiktok'],
    intent: 0.55,
    adCostPerSessionCents: 130,
    extraAcquisitionCostPerSessionCents: 0,
  },
  // Affiliate payouts are an acquisition cost but not media spend.
  {
    channel: 'Referral',
    weight: 6,
    sources: ['outdoorgearlab', 'reddit'],
    intent: 0.9,
    adCostPerSessionCents: 0,
    extraAcquisitionCostPerSessionCents: 22,
  },
  {
    channel: 'AI Referral',
    weight: 4,
    // Demo source labels only. Real AI referral traffic is frequently
    // mislabelled or invisible in analytics; Dispatch 6 states that limitation.
    sources: ['chatgpt', 'perplexity', 'gemini', 'copilot'],
    intent: 1.05,
    adCostPerSessionCents: 0,
    extraAcquisitionCostPerSessionCents: 0,
  },
];

/**
 * Base stage-to-stage progression, before the channel intent multiplier.
 * Tuned so the whole-site conversion rate lands in the 2–3% band that a real
 * DTC outdoor brand would report.
 */
const STAGE_RATES = {
  productView: 0.6,
  addToCart: 0.24,
  checkout: 0.42,
  purchase: 0.3,
} as const;

/** Expensive items convert worse than cheap ones, as they do in reality. */
const PRICE_CONVERSION_PIVOT_CENTS = 15000;

const DISCOUNT_SHARE = 0.15;
const DISCOUNT_RATE = 0.1;

export interface TrafficFixture {
  window: DateWindow;
  sessions: SessionFact[];
  orders: Order[];
  orderItems: OrderItem[];
  channelSpend: ChannelSpend[];
}

interface WeightedProduct {
  product: Product;
  weight: number;
}

function weekdayIndex(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function pickWeighted<T>(
  source: RandomSource,
  items: readonly T[],
  weightOf: (item: T) => number,
): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = source.next() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new RangeError('Cannot pick from an empty list');
  return last;
}

function pickFrom<T>(source: RandomSource, items: readonly T[]): T {
  const item = items[Math.floor(source.next() * items.length)];
  if (item === undefined) throw new RangeError('Cannot pick from an empty list');
  return item;
}

/**
 * Price resistance: a $429 tent converts worse than a $45 headlamp. Returns a
 * multiplier around 1.0 so the site-wide rate stays in a believable band.
 */
function priceResistance(product: Product): number {
  const ratio = PRICE_CONVERSION_PIVOT_CENTS / product.priceCents;
  return Math.min(1.35, Math.max(0.55, 0.75 + ratio * 0.35));
}

/** Walks the funnel in order, so `stages` is always a valid ordered prefix. */
function walkStages(
  source: RandomSource,
  intent: number,
  resistance: number,
): FunnelStage[] {
  const stages: FunnelStage[] = ['session'];
  if (source.next() > STAGE_RATES.productView) return stages;
  stages.push('product_view');

  if (source.next() > STAGE_RATES.addToCart * intent * resistance) return stages;
  stages.push('add_to_cart');

  // Traffic intent is deliberately NOT applied here. Whether someone who has
  // reached the checkout completes it is mostly a question of shipping cost,
  // payment options and trust — properties of the checkout, not of where the
  // visit came from. Applying the channel multiplier at all three remaining
  // stages compounded it into implausibly low paid-social conversion rates.
  if (source.next() > STAGE_RATES.checkout) return stages;
  stages.push('checkout');

  if (source.next() > STAGE_RATES.purchase * intent * resistance) return stages;
  stages.push('purchase');
  return stages;
}

/**
 * Order lines are drawn from the products the session actually viewed, so a
 * purchase can never be attributed to a product nobody looked at.
 */
function buildOrderLines(
  source: RandomSource,
  orderId: string,
  viewed: readonly Product[],
): OrderItem[] {
  const primary = viewed[0];
  if (primary === undefined) {
    throw new RangeError('A purchasing session must have viewed a product');
  }

  const chosen: Product[] = [primary];
  const second = viewed[1];
  // A second viewed product joins the order sometimes — a real basket is mostly
  // one item, occasionally two.
  if (second !== undefined && source.next() < 0.28) {
    chosen.push(second);
  }

  const quantities = chosen.map(() => (source.next() < 0.12 ? 2 : 1));
  const grossPerLine = chosen.map(
    (product, index) => product.priceCents * (quantities[index] ?? 1),
  );
  const gross = sumCents(grossPerLine);

  // Order-level discount is apportioned across lines so the line amounts always
  // add back up to the order total — no cent is lost to rounding.
  const discountTotal =
    source.next() < DISCOUNT_SHARE ? Math.round(gross * DISCOUNT_RATE) : 0;
  const discounts = apportionCents(discountTotal, grossPerLine);

  return chosen.map((product, index) => ({
    orderId,
    productId: product.id,
    quantity: quantities[index] ?? 1,
    unitPriceCents: product.priceCents,
    discountCents: discounts[index] ?? 0,
  }));
}

export function generateTrafficFixture(
  seed: number = DEMO_SEED,
  window: DateWindow = DEMO_WINDOW,
): TrafficFixture {
  const source = createRandomSource(seed);
  const state = buildDemoSeedState();
  const weights = new Map(
    catalogueDemandWeights().map(({ productId, weight }) => [productId, weight]),
  );

  // Archived and draft products get no traffic: they are not live pages.
  const live: WeightedProduct[] = state.products
    .filter((product) => product.status === 'active')
    .map((product) => ({
      product,
      weight: weights.get(product.id) ?? 1,
    }));
  if (live.length === 0) {
    throw new Error('Traffic fixture needs at least one active product');
  }

  const sessions: SessionFact[] = [];
  const channelSpend: ChannelSpend[] = [];
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const knownCustomers = new Set<string>();

  // A bounded user pool produces returning visitors, so user counts are lower
  // than session counts and de-duplication is actually exercised.
  const userPoolSize = Math.round(BASE_SESSIONS_PER_DAY * window.days * 0.62);

  for (let dayOffset = 0; dayOffset < window.days; dayOffset += 1) {
    const date = addDays(window.start, dayOffset);
    const weekday = WEEKDAY_FACTORS[weekdayIndex(date)] ?? 1;
    // Mild upward trend across the window; no random growth spikes.
    const trend = 0.9 + (dayOffset / window.days) * 0.25;
    const noise = 0.9 + source.next() * 0.2;
    const daySessions = Math.max(
      1,
      Math.round(BASE_SESSIONS_PER_DAY * weekday * trend * noise),
    );

    // Spend is derived from the sessions a channel actually delivered that day,
    // so the two can never drift apart.
    const sessionsByChannel = new Map<Channel, number>();

    for (let i = 0; i < daySessions; i += 1) {
      const sessionId = `ses_${date}_${String(i).padStart(3, '0')}`;
      const profile = pickWeighted(source, CHANNEL_PROFILES, (p) => p.weight);
      sessionsByChannel.set(
        profile.channel,
        (sessionsByChannel.get(profile.channel) ?? 0) + 1,
      );
      const userId = `usr_${String(
        1 + Math.floor(source.next() * userPoolSize),
      ).padStart(5, '0')}`;

      // The entry page is chosen by relative search demand; it decides which
      // product the session is "about".
      const landing = pickWeighted(source, live, (entry) => entry.weight);
      const stages = walkStages(
        source,
        profile.intent,
        priceResistance(landing.product),
      );

      const viewed: Product[] = [];
      if (stages.includes('product_view')) {
        viewed.push(landing.product);
        // Some sessions browse on to a second or third product.
        const extra = source.next() < 0.35 ? (source.next() < 0.3 ? 2 : 1) : 0;
        for (let n = 0; n < extra; n += 1) {
          const candidate = pickWeighted(source, live, (entry) => entry.weight);
          if (!viewed.some((product) => product.id === candidate.product.id)) {
            viewed.push(candidate.product);
          }
        }
      }

      let orderId: string | null = null;
      if (stages.includes('purchase')) {
        orderId = `ord_${date}_${String(i).padStart(3, '0')}`;
        const lines = buildOrderLines(source, orderId, viewed);
        const revenueCents = sumCents(
          lines.map(
            (line) => line.unitPriceCents * line.quantity - line.discountCents,
          ),
        );
        const isNewCustomer = !knownCustomers.has(userId);
        knownCustomers.add(userId);

        orderItems.push(...lines);
        orders.push({
          id: orderId,
          sessionId,
          userId,
          date,
          attributedChannel: profile.channel,
          isNewCustomer,
          revenueCents,
        });
      }

      sessions.push({
        sessionId,
        userId,
        date,
        channel: profile.channel,
        source: pickFrom(source, profile.sources),
        landingPageId: snapshotIdFor(landing.product.id),
        stages,
        viewedProductIds: viewed.map((product) => product.id),
        orderId,
      });
    }

    // One spend record per channel per day, for every channel — including the
    // ones that cost nothing. A zero row is a fact ("we spent nothing here"),
    // which is different from having no row at all.
    for (const profile of CHANNEL_PROFILES) {
      const channelSessions = sessionsByChannel.get(profile.channel) ?? 0;
      const adSpendCents = Math.round(
        channelSessions * profile.adCostPerSessionCents,
      );
      const extraCents = Math.round(
        channelSessions * profile.extraAcquisitionCostPerSessionCents,
      );
      channelSpend.push({
        date,
        channel: profile.channel,
        // Acquisition spend includes media spend: every dollar of ad spend is
        // also a dollar spent acquiring customers.
        acquisitionSpendCents: adSpendCents + extraCents,
        adSpendCents,
      });
    }
  }

  return { window, sessions, orders, orderItems, channelSpend };
}

let cached: TrafficFixture | null = null;

/**
 * Memoised because generation is deterministic: recomputing would burn cycles
 * to produce the identical result. Callers get a frozen-by-convention fixture
 * and must not mutate it.
 */
export function getTrafficFixture(): TrafficFixture {
  cached ??= generateTrafficFixture();
  return cached;
}

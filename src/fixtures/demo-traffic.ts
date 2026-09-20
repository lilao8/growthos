import {
  addDays,
  DEMO_WINDOW,
  type DateWindow,
} from '@/domain/demo-window';
import { apportionCents, sumCents } from '@/domain/money';
import { createRandomSource, DEMO_SEED, type RandomSource } from '@/domain/seed';
import type {
  Channel,
  FunnelStage,
  Order,
  OrderItem,
  Product,
  SessionFact,
} from '@/domain/types';
import { buildDemoSeedState } from './demo-seed';

/**
 * Deterministic traffic fixture.
 *
 * Scope note (Dispatch 1): this is a small, provisional data set sized to make
 * the six dashboard metrics real rather than hard-coded. The full analytics data
 * set — daily channel spend, AI referral sources, per-channel CAC/ROAS — is built
 * in Dispatch 6, which this module is shaped to grow into.
 *
 * Nothing here calls Math.random(). The same seed always produces the same
 * sessions, so the dashboard shows identical numbers on every machine and reload.
 */

const BASE_SESSIONS_PER_DAY = 30;

/** Weekday index 0 = Sunday. Outdoor gear browses heavier at the weekend. */
const WEEKDAY_FACTORS = [1.18, 0.88, 0.9, 0.92, 0.96, 1.05, 1.22] as const;

interface ChannelProfile {
  channel: Channel;
  weight: number;
  sources: readonly string[];
  /** Multiplier on purchase intent. Intent-led channels convert better. */
  intent: number;
}

const CHANNEL_PROFILES: readonly ChannelProfile[] = [
  { channel: 'Organic Search', weight: 34, sources: ['google', 'bing'], intent: 1.15 },
  { channel: 'Direct', weight: 15, sources: ['(direct)'], intent: 1.2 },
  { channel: 'Paid Search', weight: 12, sources: ['google-ads'], intent: 1.05 },
  { channel: 'Meta', weight: 12, sources: ['facebook', 'instagram'], intent: 0.78 },
  { channel: 'Email', weight: 9, sources: ['klaviyo'], intent: 1.35 },
  { channel: 'TikTok', weight: 8, sources: ['tiktok'], intent: 0.62 },
  { channel: 'Referral', weight: 6, sources: ['outdoorgearlab', 'reddit'], intent: 0.95 },
  {
    channel: 'AI Referral',
    weight: 4,
    // Demo source labels only. Real AI referral traffic is frequently
    // mislabelled or invisible in analytics; Dispatch 6 states that limitation.
    sources: ['chatgpt', 'perplexity', 'gemini', 'copilot'],
    intent: 1.1,
  },
];

/** Base stage-to-stage progression, before the channel intent multiplier. */
const STAGE_RATES = {
  productView: 0.62,
  addToCart: 0.28,
  checkout: 0.45,
  purchase: 0.33,
} as const;

const DISCOUNT_SHARE = 0.15;
const DISCOUNT_RATE = 0.1;

export interface TrafficFixture {
  window: DateWindow;
  sessions: SessionFact[];
  orders: Order[];
  orderItems: OrderItem[];
}

function weekdayIndex(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function pickWeighted(
  source: RandomSource,
  profiles: readonly ChannelProfile[],
): ChannelProfile {
  const total = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  let roll = source.next() * total;
  for (const profile of profiles) {
    roll -= profile.weight;
    if (roll <= 0) return profile;
  }
  const last = profiles[profiles.length - 1];
  if (last === undefined) throw new RangeError('No channel profiles configured');
  return last;
}

function pickFrom<T>(source: RandomSource, items: readonly T[]): T {
  const item = items[Math.floor(source.next() * items.length)];
  if (item === undefined) throw new RangeError('Cannot pick from an empty list');
  return item;
}

/** Walks the funnel in order, so `stages` is always a valid ordered prefix. */
function walkStages(source: RandomSource, intent: number): FunnelStage[] {
  const stages: FunnelStage[] = ['session'];
  if (source.next() > STAGE_RATES.productView) return stages;
  stages.push('product_view');

  if (source.next() > STAGE_RATES.addToCart * intent) return stages;
  stages.push('add_to_cart');

  if (source.next() > STAGE_RATES.checkout * intent) return stages;
  stages.push('checkout');

  if (source.next() > STAGE_RATES.purchase * intent) return stages;
  stages.push('purchase');
  return stages;
}

function buildOrderLines(
  source: RandomSource,
  orderId: string,
  products: readonly Product[],
): OrderItem[] {
  const lineCount = source.next() < 0.2 ? 2 : 1;
  const chosen: Product[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const candidate = pickFrom(source, products);
    if (!chosen.some((product) => product.id === candidate.id)) {
      chosen.push(candidate);
    }
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
  // Only sellable products can appear on an order line.
  const sellable = state.products.filter((product) => product.status === 'active');
  const landingPageIds = state.pageSnapshots.map((snapshot) => snapshot.id);
  if (sellable.length === 0 || landingPageIds.length === 0) {
    throw new Error('Traffic fixture needs at least one product and one page');
  }

  const sessions: SessionFact[] = [];
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

    for (let i = 0; i < daySessions; i += 1) {
      const sessionId = `ses_${date}_${String(i).padStart(3, '0')}`;
      const profile = pickWeighted(source, CHANNEL_PROFILES);
      const userId = `usr_${String(
        1 + Math.floor(source.next() * userPoolSize),
      ).padStart(5, '0')}`;
      const stages = walkStages(source, profile.intent);

      let orderId: string | null = null;
      if (stages.includes('purchase')) {
        orderId = `ord_${date}_${String(i).padStart(3, '0')}`;
        const lines = buildOrderLines(source, orderId, sellable);
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
        landingPageId: pickFrom(source, landingPageIds),
        stages,
        orderId,
      });
    }
  }

  return { window, sessions, orders, orderItems };
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

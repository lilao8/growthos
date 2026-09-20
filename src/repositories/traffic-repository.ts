import type {
  ChannelSpend,
  Order,
  OrderItem,
  SessionFact,
} from '@/domain/types';
import { getTrafficFixture } from '@/fixtures/demo-traffic';

/**
 * Traffic and commerce facts are read-only demo data: nobody edits a session.
 * They are therefore kept out of the persisted DemoState and served from their
 * own repository, so browser storage only ever holds records a user can change.
 */

export interface TrafficData {
  sessions: SessionFact[];
  orders: Order[];
  orderItems: OrderItem[];
  channelSpend: ChannelSpend[];
}

export interface TrafficRepository {
  /** Rejects on failure. The service layer turns that into an error state. */
  load(): Promise<TrafficData>;
}

export function createFixtureTrafficRepository(): TrafficRepository {
  return {
    async load(): Promise<TrafficData> {
      const fixture = getTrafficFixture();
      return {
        sessions: fixture.sessions,
        orders: fixture.orders,
        orderItems: fixture.orderItems,
        channelSpend: fixture.channelSpend,
      };
    },
  };
}

/** No rows, not a failure — drives the empty state. */
export function createEmptyTrafficRepository(): TrafficRepository {
  return {
    async load(): Promise<TrafficData> {
      return { sessions: [], orders: [], orderItems: [], channelSpend: [] };
    },
  };
}

export function createFailingTrafficRepository(
  message = 'Demo data source is unavailable.',
): TrafficRepository {
  return {
    async load(): Promise<TrafficData> {
      throw new Error(message);
    },
  };
}

/** Wraps another repository with a delay so the loading state is observable. */
export function createDelayedTrafficRepository(
  inner: TrafficRepository,
  delayMs: number,
): TrafficRepository {
  return {
    async load(): Promise<TrafficData> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return inner.load();
    },
  };
}

/**
 * Fails a fixed number of times, then succeeds. Used to prove that retry does
 * something rather than just re-rendering the same error.
 */
export function createFlakyTrafficRepository(
  failures: number,
  inner: TrafficRepository = createFixtureTrafficRepository(),
): TrafficRepository {
  let remaining = failures;
  return {
    async load(): Promise<TrafficData> {
      if (remaining > 0) {
        remaining -= 1;
        throw new Error('Demo data source is unavailable.');
      }
      return inner.load();
    },
  };
}

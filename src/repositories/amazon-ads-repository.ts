import type {
  AdCampaign,
  AdTarget,
  AsinDailyReport,
  SearchTermRow,
} from '@/domain/types';
import { getAmazonAdsFixture } from '@/fixtures/demo-amazon-ads';

/**
 * Advertising and Business Report facts are read-only, exactly like the
 * storefront's sessions and orders: nobody edits a report row. They therefore
 * stay out of the persisted DemoState and are served from their own repository,
 * so browser storage only ever holds records a user can actually change.
 *
 * That is also why SCHEMA_VERSION does not move for this dispatch.
 */

export interface AmazonAdsData {
  campaigns: AdCampaign[];
  targets: AdTarget[];
  searchTerms: SearchTermRow[];
  reports: AsinDailyReport[];
}

export interface AmazonAdsRepository {
  /** Rejects on failure. The service layer turns that into an error state. */
  load(): Promise<AmazonAdsData>;
}

export function createFixtureAmazonAdsRepository(): AmazonAdsRepository {
  return {
    async load(): Promise<AmazonAdsData> {
      const fixture = getAmazonAdsFixture();
      return {
        campaigns: fixture.campaigns,
        targets: fixture.targets,
        searchTerms: fixture.searchTerms,
        reports: fixture.reports,
      };
    },
  };
}

/** No rows, not a failure — drives the empty state. */
export function createEmptyAmazonAdsRepository(): AmazonAdsRepository {
  return {
    async load(): Promise<AmazonAdsData> {
      return { campaigns: [], targets: [], searchTerms: [], reports: [] };
    },
  };
}

export function createFailingAmazonAdsRepository(
  message = 'Demo data source is unavailable.',
): AmazonAdsRepository {
  return {
    async load(): Promise<AmazonAdsData> {
      throw new Error(message);
    },
  };
}

export function createDelayedAmazonAdsRepository(
  inner: AmazonAdsRepository,
  delayMs: number,
): AmazonAdsRepository {
  return {
    async load(): Promise<AmazonAdsData> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return inner.load();
    },
  };
}

/** Fails a fixed number of times, then succeeds, so retry is observable. */
export function createFlakyAmazonAdsRepository(
  failures: number,
  inner: AmazonAdsRepository = createFixtureAmazonAdsRepository(),
): AmazonAdsRepository {
  let remaining = failures;
  return {
    async load(): Promise<AmazonAdsData> {
      if (remaining > 0) {
        remaining -= 1;
        throw new Error('Demo data source is unavailable.');
      }
      return inner.load();
    },
  };
}

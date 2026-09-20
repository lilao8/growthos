import { z } from 'zod';
import type { PageSnapshot, Product, StoredAuditResult } from '@/domain/types';
import {
  pageSnapshotSchema,
  productSchema,
  storedAuditResultSchema,
} from '@/domain/schemas';

/**
 * Persistence contract.
 *
 * There is no database in this project and none is planned: the demo data set is
 * seeded and self-contained. This layer exists for two reasons that apply today —
 * server rendering cannot reach browser storage, and tests need a backend that is
 * not localStorage. Adapters stay deliberately thin; no ORM, no query abstraction.
 */

/** Bumped whenever the persisted shape changes; older payloads are discarded. */
export const SCHEMA_VERSION = 3;

/**
 * Everything the demo persists.
 *
 * Audit results are stored because running an audit is an explicit user action
 * with a timestamp — re-deriving them on every render would erase the record of
 * when a page was last checked. Scores themselves are still never stored on the
 * product; they are read from the latest audit for that page.
 */
export interface DemoState {
  schemaVersion: number;
  products: Product[];
  pageSnapshots: PageSnapshot[];
  auditResults: StoredAuditResult[];
}

export const demoStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  products: z.array(productSchema),
  pageSnapshots: z.array(pageSnapshotSchema),
  auditResults: z.array(storedAuditResultSchema),
});

export type PersistedDemoState = z.infer<typeof demoStateSchema>;

/**
 * Why a state read can come back without data. Callers must distinguish these:
 * `unavailable` is a server render, which should fall back to the seed rather
 * than render an empty dashboard; `corrupted` is a real problem worth surfacing.
 */
export type StateLoadStatus = 'loaded' | 'empty' | 'corrupted' | 'unavailable';

export interface StateLoadResult {
  status: StateLoadStatus;
  state: DemoState;
  /** Present when status is 'corrupted', for the UI to explain the reset offer. */
  error: string | null;
}

export interface DemoStateRepository {
  load(): Promise<StateLoadResult>;
  save(state: DemoState): Promise<void>;
  /** Clears persisted demo data. Only ever called from an explicit user action. */
  reset(): Promise<StateLoadResult>;
}

/** Read/update surface later dispatches build product screens on. */
export interface ProductRepository {
  list(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getBySlug(slug: string): Promise<Product | null>;
}

export interface PageSnapshotRepository {
  getByPageId(pageId: string): Promise<PageSnapshot | null>;
  getByProductId(productId: string): Promise<PageSnapshot | null>;
}

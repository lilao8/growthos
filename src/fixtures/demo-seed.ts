import type { DemoState } from '@/repositories/types';
import { demoStateSchema, SCHEMA_VERSION } from '@/repositories/types';
import {
  buildCatalogueProducts,
  buildCatalogueSnapshots,
} from './demo-catalogue';
import { buildDemoContentIdeas } from './demo-content';

/**
 * The seed state: the records a user can edit, before any of their edits.
 *
 * Traffic, orders and audit results are not here — sessions are read-only facts
 * served by their own repository, and scores are derived by rule engines rather
 * than stored.
 */

export {
  DEMO_BRAND,
  DEMO_MARKET,
  DEMO_SITE_ORIGIN,
  snapshotIdFor,
} from './demo-catalogue';

/**
 * Returns a fresh, validated copy of the seed state. Callers may mutate the
 * result freely; the fixture itself is never handed out by reference.
 */
export function buildDemoSeedState(): DemoState {
  const candidate: DemoState = {
    schemaVersion: SCHEMA_VERSION,
    products: buildCatalogueProducts(),
    pageSnapshots: buildCatalogueSnapshots(),
    // No audits have been run in a fresh demo: a score must be earned by an
    // explicit audit, never shipped as seed data.
    auditResults: [],
    contentIdeas: buildDemoContentIdeas(),
    // Nobody has marked anything done in a fresh demo.
    recommendationStatuses: [],
  };

  // The fixture is parsed like any other boundary input: a bad fixture should
  // fail loudly in tests rather than flow into the domain.
  const parsed = demoStateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new TypeError(
      `Demo seed fixture is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

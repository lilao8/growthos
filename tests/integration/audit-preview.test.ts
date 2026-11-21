import { describe, expect, it } from 'vitest';
import { loadSeoPage, runSeoAuditForPage } from '@/services/seo-audit-service';
import { loadGeoPage, runGeoAuditForPage } from '@/services/geo-audit-service';
import { saveProductSeo } from '@/services/product-service';
import { runTool } from '@/services/agent-tools/registry';
import { createMemoryStateRepository } from '@/repositories/memory-state-repository';
import { createFixtureTrafficRepository } from '@/repositories/traffic-repository';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import type { DemoState, DemoStateRepository } from '@/repositories/types';

/**
 * The audit pages' read-only preview: what an agent evidence link opens. It
 * must show the same checks the agent cited, and it must never write.
 */

const NOW = '2026-09-01T00:00:00.000Z';
const PAGE = 'snap_ridgeline_2p_tent';
const PRODUCT = 'prd_ridgeline_2p_tent';

/** Wraps a repository and counts saves, so "nothing was written" is asserted, not assumed. */
function counting(inner: DemoStateRepository): DemoStateRepository & { saves: () => number } {
  let saves = 0;
  return {
    load: () => inner.load(),
    save: async (state: DemoState) => {
      saves += 1;
      await inner.save(state);
    },
    reset: () => inner.reset(),
    saves: () => saves,
  };
}

async function toolChecks(state: DemoState, kind: 'seo' | 'geo') {
  const outcome = await runTool(
    'get_audit_findings',
    { kind, products: [PRODUCT] },
    { traffic: createFixtureTrafficRepository(), state: { source: 'browser-local', value: state }, now: () => NOW },
  );
  if (outcome.status !== 'ok') throw new Error(outcome.status);
  return outcome.meta.auditRefs.map((ref) => ({ ruleId: ref.ruleId, status: ref.status, evidence: ref.evidence }));
}

describe('read-only audit preview', () => {
  it('without preview, an unaudited page still reads as unaudited', async () => {
    const state = counting(createMemoryStateRepository(buildDemoSeedState()));
    const result = await loadSeoPage({ state, now: () => NOW }, PAGE);
    if (result.status !== 'ready') throw new Error(result.status);
    expect(result.row.audit).toBeNull();
    expect(result.preview).toBeNull();
  });

  it('previews an unaudited page with the checks the agent cited, and saves nothing', async () => {
    const state = counting(createMemoryStateRepository(buildDemoSeedState()));
    const before = await state.load();
    const result = await loadSeoPage({ state, now: () => NOW }, PAGE, { preview: true });
    if (result.status !== 'ready' || result.row.audit === null) throw new Error('expected a preview');
    expect(result.preview).toEqual({ computedBecause: 'not-audited' });

    const cited = await toolChecks(before.state, 'seo');
    const failing = result.row.audit.checks
      .filter((check) => cited.some((ref) => ref.ruleId === check.ruleId))
      .map((check) => ({ ruleId: check.ruleId, status: check.status, evidence: check.evidence }));
    expect(failing).toEqual(cited);
    expect(cited.length).toBeGreaterThan(0);

    expect(state.saves()).toBe(0);
    expect(await state.load()).toEqual(before);
  });

  it('shows the saved audit, not a preview, once the audit is current', async () => {
    const state = counting(createMemoryStateRepository(buildDemoSeedState()));
    await runSeoAuditForPage({ state, now: () => NOW }, PAGE);
    const result = await loadSeoPage({ state, now: () => '2026-12-01T00:00:00.000Z' }, PAGE, { preview: true });
    if (result.status !== 'ready' || result.row.audit === null) throw new Error('expected audit');
    expect(result.preview).toBeNull();
    expect(result.row.audit.auditedAt).toBe(NOW);
  });

  it('previews the edited page when the saved audit is stale', async () => {
    const repository = createMemoryStateRepository(buildDemoSeedState());
    await runSeoAuditForPage({ state: repository, now: () => NOW }, PAGE);
    await saveProductSeo(
      { state: repository, traffic: createFixtureTrafficRepository() },
      PRODUCT,
      { primaryKeyword: 'ultralight two person tent', metaTitle: 'Ridgeline 2P', metaDescription: 'Short.' },
    );
    const state = counting(repository);
    const result = await loadSeoPage({ state, now: () => NOW }, PAGE, { preview: true });
    if (result.status !== 'ready' || result.row.audit === null) throw new Error('expected a preview');
    expect(result.preview).toEqual({ computedBecause: 'stale' });
    expect(result.row.audit.stale).toBe(false);
    const titleLength = result.row.audit.checks.find((check) => check.ruleId === 'meta-title-length');
    expect(titleLength?.evidence).toContain('12');
    expect(state.saves()).toBe(0);
  });

  it('works the same way for GEO, including readiness', async () => {
    const state = counting(createMemoryStateRepository(buildDemoSeedState()));
    const before = await state.load();
    const preview = await loadGeoPage({ state, now: () => NOW }, PAGE, { preview: true });
    if (preview.status !== 'ready' || preview.row.audit === null) throw new Error('expected a preview');
    expect(preview.preview).toEqual({ computedBecause: 'not-audited' });
    expect(preview.row.readiness).not.toBeNull();

    const cited = await toolChecks(before.state, 'geo');
    for (const ref of cited) {
      const check = preview.row.audit.checks.find((candidate) => candidate.ruleId === ref.ruleId);
      expect({ ruleId: check?.ruleId, status: check?.status, evidence: check?.evidence }).toEqual(ref);
    }
    expect(state.saves()).toBe(0);

    await runGeoAuditForPage({ state, now: () => NOW }, PAGE);
    const saved = await loadGeoPage({ state, now: () => NOW }, PAGE, { preview: true });
    if (saved.status !== 'ready' || saved.row.audit === null) throw new Error('expected audit');
    expect(saved.preview).toBeNull();
    expect(saved.row.audit.score).toBe(preview.row.audit.score);
  });

  it('returns not-found for an unknown page in preview too', async () => {
    const state = createMemoryStateRepository(buildDemoSeedState());
    expect((await loadSeoPage({ state }, 'snap_missing', { preview: true })).status).toBe('not-found');
  });
});

import { describe, expect, it } from 'vitest';
import { currentAudit } from '@/domain/audit-preview';
import { runGeoAudit } from '@/domain/geo-audit/engine';
import { runSeoAudit } from '@/domain/seo-audit/engine';
import { buildDemoSeedState } from '@/fixtures/demo-seed';
import type { PageSnapshot } from '@/domain/types';

const seed = buildDemoSeedState();
const snapshot = seed.pageSnapshots[0] as PageSnapshot;
const product = seed.products.find((candidate) => candidate.id === snapshot.productId);
const keyword = product?.primaryKeyword ?? '';
const BRAND = 'NorthTrail Outdoor';
const THEN = '2026-08-01T00:00:00.000Z';
const NOW = '2026-09-01T00:00:00.000Z';

describe('currentAudit', () => {
  it('runs the engine when the page was never audited, without needing storage', () => {
    const result = currentAudit({ kind: 'seo', snapshot, primaryKeyword: keyword, brand: BRAND, stored: [], now: NOW });
    expect(result.origin).toBe('computed-on-request');
    expect(result.computedBecause).toBe('not-audited');
    expect(result.audit.stale).toBe(false);
    expect(result.audit.auditedAt).toBe(NOW);
    expect(result.audit.checks).toEqual(runSeoAudit({ snapshot, primaryKeyword: keyword, now: NOW }).checks);
  });

  it('returns a current stored audit unchanged', () => {
    const stored = runSeoAudit({ snapshot, primaryKeyword: keyword, now: THEN });
    const result = currentAudit({ kind: 'seo', snapshot, primaryKeyword: keyword, brand: BRAND, stored: [stored], now: NOW });
    expect(result.origin).toBe('stored');
    expect(result.computedBecause).toBeNull();
    expect(result.audit).toEqual({ ...stored, stale: false });
  });

  it('recomputes when the page changed after its audit, and says so', () => {
    const stored = runSeoAudit({ snapshot, primaryKeyword: keyword, now: THEN });
    const edited: PageSnapshot = { ...snapshot, metaTitle: 'Short' };
    const result = currentAudit({ kind: 'seo', snapshot: edited, primaryKeyword: keyword, brand: BRAND, stored: [stored], now: NOW });
    expect(result.origin).toBe('computed-on-request');
    expect(result.computedBecause).toBe('stale');
    expect(result.audit.auditedAt).toBe(NOW);
    expect(result.audit.inputFingerprint).not.toBe(stored.inputFingerprint);
  });

  it('treats a keyword change as stale for SEO', () => {
    const stored = runSeoAudit({ snapshot, primaryKeyword: keyword, now: THEN });
    const result = currentAudit({ kind: 'seo', snapshot, primaryKeyword: `${keyword} x`, brand: BRAND, stored: [stored], now: NOW });
    expect(result.computedBecause).toBe('stale');
  });

  it('ignores the keyword for GEO and uses the given brand', () => {
    const stored = runGeoAudit({ snapshot, brand: BRAND, now: THEN });
    const kept = currentAudit({ kind: 'geo', snapshot, primaryKeyword: 'anything', brand: BRAND, stored: [stored], now: NOW });
    expect(kept.origin).toBe('stored');

    const fresh = currentAudit({ kind: 'geo', snapshot, primaryKeyword: 'anything', brand: BRAND, stored: [], now: NOW });
    expect(fresh.audit.checks).toEqual(runGeoAudit({ snapshot, brand: BRAND, now: NOW }).checks);
    expect(fresh.audit.kind).toBe('geo');
  });

  it('does not take a stored audit of the other kind', () => {
    const geo = runGeoAudit({ snapshot, brand: BRAND, now: THEN });
    const result = currentAudit({ kind: 'seo', snapshot, primaryKeyword: keyword, brand: BRAND, stored: [geo], now: NOW });
    expect(result.computedBecause).toBe('not-audited');
    expect(result.audit.kind).toBe('seo');
  });
});

import { describe, expect, it } from 'vitest';
import { readAudit, upsertAudit } from '@/domain/audit-lookup';
import { auditInputFingerprint } from '@/domain/audit-fingerprint';
import type {
  AuditKind,
  PageSnapshot,
  StoredAuditResult,
} from '@/domain/types';

/**
 * Staleness and audit lookup.
 *
 * These were covered only indirectly, through the SEO and GEO service
 * integration tests. The behaviour they guarantee is subtle enough to deserve
 * its own test: staleness is *derived* on every read rather than stored, and
 * each engine fingerprints exactly the inputs it reads — so a keyword edit
 * must invalidate an SEO result and must NOT invalidate a GEO one.
 */

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    id: 'snap_a',
    productId: 'prd_a',
    url: 'https://northtrail.example.com/products/ridgeline-2p',
    metaTitle: 'Ridgeline 2P Backpacking Tent',
    metaDescription: 'A two person tent for three season use.',
    h1: 'Ridgeline 2P Backpacking Tent',
    headings: [{ level: 1, text: 'Ridgeline 2P Backpacking Tent' }],
    bodyText: 'A freestanding two person tent weighing 4.2 lb.',
    images: [{ src: '/img/tent.jpg', alt: 'The tent pitched', decorative: false }],
    internalLinks: [{ href: '/collections/tents', anchorText: 'All tents' }],
    canonical: 'https://northtrail.example.com/products/ridgeline-2p',
    indexability: 'index',
    structuredData: [],
    directAnswer: 'The Ridgeline 2P weighs 4.2 lb packed.',
    faq: [],
    facts: [],
    evidence: [],
    originalityClaim: null,
    capturedAt: '2026-08-31',
    ...overrides,
  };
}

function stored(
  page: PageSnapshot,
  kind: AuditKind,
  keyword: string,
): StoredAuditResult {
  return {
    id: `audit_${kind}_${page.id}`,
    pageId: page.id,
    kind,
    ruleVersion: `${kind}-1.0.0`,
    checks: [
      {
        ruleId: 'x',
        status: 'pass',
        severity: 'info',
        message: 'ok',
        explanation: 'because',
        recommendation: 'none',
        evidence: null,
        points: null,
      },
    ],
    score: 80,
    coverage: 1,
    auditedAt: '2026-08-31T00:00:00.000Z',
    inputFingerprint: auditInputFingerprint(kind, page, keyword),
  };
}

describe('readAudit', () => {
  it('returns null when no audit has been run for the page', () => {
    expect(readAudit([], snapshot(), 'two person tent', 'seo')).toBeNull();
  });

  it('returns null when only the other kind has been run', () => {
    const page = snapshot();
    const results = [stored(page, 'geo', '')];
    expect(readAudit(results, page, 'two person tent', 'seo')).toBeNull();
    expect(readAudit(results, page, '', 'geo')).not.toBeNull();
  });

  it('returns null for a different page', () => {
    const page = snapshot();
    const other = snapshot({ id: 'snap_b' });
    expect(readAudit([stored(page, 'seo', 'k')], other, 'k', 'seo')).toBeNull();
  });

  it('reports a result as current when nothing has changed', () => {
    const page = snapshot();
    const result = readAudit([stored(page, 'seo', 'k')], page, 'k', 'seo');
    expect(result?.stale).toBe(false);
  });

  it('derives staleness rather than trusting what was stored', () => {
    const page = snapshot();
    // A result that claims a fingerprint it does not have must still be
    // reported as stale — the stored value is evidence, not a verdict.
    const lying = { ...stored(page, 'seo', 'k'), inputFingerprint: 'nonsense' };
    expect(readAudit([lying], page, 'k', 'seo')?.stale).toBe(true);
  });

  it('goes stale when an audited field changes', () => {
    const before = snapshot();
    const after = snapshot({ metaTitle: 'A rewritten title' });
    const result = readAudit([stored(before, 'seo', 'k')], after, 'k', 'seo');
    expect(result?.stale).toBe(true);
  });

  it('does not go stale when a field no engine reads changes', () => {
    const before = snapshot();
    // capturedAt is recorded but graded by nothing; re-capturing the same page
    // must not tell the user to redo an audit whose result cannot change.
    const after = snapshot({ capturedAt: '2026-09-01' });
    expect(readAudit([stored(before, 'seo', 'k')], after, 'k', 'seo')?.stale).toBe(
      false,
    );
  });
});

describe('each engine fingerprints only what it reads', () => {
  const page = snapshot();

  it('makes an SEO result stale when the keyword changes', () => {
    const result = readAudit(
      [stored(page, 'seo', 'two person tent')],
      page,
      'ultralight shelter',
      'seo',
    );
    expect(result?.stale).toBe(true);
  });

  it('leaves a GEO result current when the keyword changes', () => {
    // GEO never looks at the keyword. Marking it stale would send the user to
    // redo work that cannot produce a different answer.
    const result = readAudit(
      [stored(page, 'geo', 'two person tent')],
      page,
      'something else entirely',
      'geo',
    );
    expect(result?.stale).toBe(false);
  });

  it('treats keyword case and surrounding space as the same keyword', () => {
    const result = readAudit(
      [stored(page, 'seo', 'two person tent')],
      page,
      '  Two Person TENT ',
      'seo',
    );
    expect(result?.stale).toBe(false);
  });

  it('makes both kinds stale when the page content changes', () => {
    const changed = snapshot({ bodyText: 'Completely different copy.' });
    expect(readAudit([stored(page, 'seo', 'k')], changed, 'k', 'seo')?.stale).toBe(true);
    expect(readAudit([stored(page, 'geo', '')], changed, '', 'geo')?.stale).toBe(true);
  });
});

describe('upsertAudit', () => {
  const page = snapshot();

  it('adds a result when none exists', () => {
    const next = upsertAudit([], stored(page, 'seo', 'k'));
    expect(next).toHaveLength(1);
  });

  it('replaces the result for the same page and kind', () => {
    const first = stored(page, 'seo', 'k');
    const second = { ...first, score: 95, auditedAt: '2026-09-01T00:00:00.000Z' };
    const next = upsertAudit([first], second);
    expect(next).toHaveLength(1);
    expect(next[0]?.score).toBe(95);
  });

  it('keeps the other kind for the same page', () => {
    const next = upsertAudit([stored(page, 'geo', '')], stored(page, 'seo', 'k'));
    expect(next).toHaveLength(2);
    expect(new Set(next.map((r) => r.kind))).toEqual(new Set(['seo', 'geo']));
  });

  it('keeps results for other pages', () => {
    const other = snapshot({ id: 'snap_b' });
    const next = upsertAudit([stored(other, 'seo', 'k')], stored(page, 'seo', 'k'));
    expect(next).toHaveLength(2);
  });

  it('does not mutate the array it was given', () => {
    const existing = [stored(page, 'seo', 'k')];
    upsertAudit(existing, { ...stored(page, 'seo', 'k'), score: 10 });
    expect(existing[0]?.score).toBe(80);
  });
});

describe('auditInputFingerprint', () => {
  const page = snapshot();

  it('is stable for identical inputs', () => {
    expect(auditInputFingerprint('seo', page, 'k')).toBe(
      auditInputFingerprint('seo', page, 'k'),
    );
  });

  it('differs between the two engines for the same page', () => {
    // Otherwise a GEO result could be mistaken for a current SEO one.
    expect(auditInputFingerprint('seo', page, 'k')).not.toBe(
      auditInputFingerprint('geo', page, 'k'),
    );
  });

  it('ignores the keyword entirely for GEO', () => {
    expect(auditInputFingerprint('geo', page, 'one')).toBe(
      auditInputFingerprint('geo', page, 'two'),
    );
  });
});

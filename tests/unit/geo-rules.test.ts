import { describe, expect, it } from 'vitest';
import { runGeoAudit, scoreGeoChecks } from '@/domain/geo-audit/engine';
import {
  GEO_RULE_IDS,
  DEFAULT_GEO_CONFIG,
  readinessBand,
} from '@/domain/geo-audit/config';
import type { AuditCheck, PageSnapshot } from '@/domain/types';

const NOW = '2026-08-31T00:00:00.000Z';
const BRAND = 'NorthTrail Outdoor';
const URL = 'https://northtrail.example.com/products/ridgeline-2p-tent';

/** A page that satisfies every GEO rule, used as the baseline to perturb. */
function richSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    id: 'snap_test',
    productId: 'prd_test',
    url: URL,
    metaTitle: 'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
    metaDescription: 'A 3.9 lb freestanding two-person tent for three-season use.',
    h1: 'Ridgeline 2P Backpacking Tent',
    headings: [
      { level: 1, text: 'Ridgeline 2P Backpacking Tent' },
      { level: 2, text: 'Who this tent is for' },
      { level: 2, text: 'Specifications' },
    ],
    bodyText:
      'The Ridgeline 2P is a freestanding two-person backpacking tent weighing 3.9 lb packed. It pitches in under four minutes.',
    images: [{ src: '/a.jpg', alt: 'A tent', decorative: false }],
    internalLinks: [{ href: '/collections/tents', anchorText: 'All tents' }],
    canonical: URL,
    indexability: 'index',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Ridgeline 2P Backpacking Tent',
        sku: 'NT-TENT-RDG2',
        offers: {
          price: '329.00',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
    directAnswer:
      'The Ridgeline 2P weighs 3.9 lb packed, sleeps two adults and is rated for three seasons.',
    faq: [
      { question: 'How much does it weigh?', answer: '3.9 lb packed.' },
      { question: 'Is it freestanding?', answer: 'Yes, it pitches without stakes.' },
    ],
    facts: [
      { label: 'Packed weight', value: '3.9 lb' },
      { label: 'Floor area', value: '29 sq ft' },
      { label: 'Fly rating', value: '1800 mm' },
      { label: 'Season rating', value: '3-season' },
    ],
    evidence: [
      { label: 'In-house field test, 14 nights', url: 'https://northtrail.example.com/journal/test' },
    ],
    originalityClaim: 'Weights measured in-house on a calibrated scale.',
    capturedAt: '2026-08-31',
    ...overrides,
  };
}

/** A page with nothing but marketing copy — the opposite end of the scale. */
function thinSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return richSnapshot({
    metaTitle: 'Our Sleeping Bag',
    h1: null,
    headings: [],
    bodyText:
      'Our best sleeping bag ever. Incredible warmth, amazing value, you will love it.',
    structuredData: [],
    directAnswer: null,
    faq: [],
    facts: [],
    evidence: [],
    originalityClaim: null,
    ...overrides,
  });
}

function audit(snapshot: PageSnapshot, brand = BRAND) {
  return runGeoAudit({ snapshot, brand, now: NOW });
}

function checkFor(checks: readonly AuditCheck[], ruleId: string): AuditCheck {
  const found = checks.find((item) => item.ruleId === ruleId);
  if (found === undefined) throw new Error(`No check for ${ruleId}`);
  return found;
}

function pointsFor(snapshot: PageSnapshot, ruleId: string): number | null {
  return checkFor(audit(snapshot).checks, ruleId).points;
}

describe('rule coverage', () => {
  it('runs all ten rules exactly once, in order', () => {
    const result = audit(richSnapshot());
    expect(result.checks).toHaveLength(GEO_RULE_IDS.length);
    expect(result.checks.map((item) => item.ruleId)).toEqual([...GEO_RULE_IDS]);
  });

  it('gives every rule a message, signal explanation and recommendation', () => {
    for (const item of audit(richSnapshot()).checks) {
      expect(item.message.length).toBeGreaterThan(0);
      expect(item.explanation.length).toBeGreaterThan(0);
      expect(item.recommendation.length).toBeGreaterThan(0);
    }
  });

  it('awards only 0, 5 or 10 points per rule', () => {
    for (const item of audit(richSnapshot()).checks) {
      expect([0, 5, 10, null]).toContain(item.points);
    }
  });
});

describe('good content vs thin content', () => {
  it('scores a complete page 100 and a marketing-copy page far lower', () => {
    const good = audit(richSnapshot());
    const bad = audit(thinSnapshot());

    expect(good.score).toBe(100);
    expect(bad.score).not.toBeNull();
    expect(bad.score ?? 100).toBeLessThan(25);
  });

  it('bands the two differently', () => {
    expect(readinessBand(audit(richSnapshot()).score).label).toBe('Strong');
    expect(readinessBand(audit(thinSnapshot()).score).label).toBe('Poor');
  });

  it('explains every gap on the thin page with something actionable', () => {
    for (const item of audit(thinSnapshot()).checks) {
      if (item.points === 10) continue;
      expect(item.recommendation.length).toBeGreaterThan(10);
      expect(item.evidence).not.toBe('');
    }
  });
});

describe('topic clarity', () => {
  it('awards nothing when there is no H1', () => {
    expect(pointsFor(richSnapshot({ h1: null }), 'topic-clarity')).toBe(0);
  });

  it('awards partial marks when the H1 and title disagree', () => {
    expect(
      pointsFor(
        richSnapshot({ h1: 'Winter expedition gear guide for alpine travel' }),
        'topic-clarity',
      ),
    ).toBe(5);
  });

  it('awards partial marks when there is an H1 but no title', () => {
    expect(pointsFor(richSnapshot({ metaTitle: null }), 'topic-clarity')).toBe(5);
  });

  it('cannot assess a page with no heading and no title at all', () => {
    expect(
      pointsFor(
        richSnapshot({ h1: null, metaTitle: null, headings: [] }),
        'topic-clarity',
      ),
    ).toBeNull();
  });
});

describe('direct answer', () => {
  it('awards nothing when absent', () => {
    expect(pointsFor(richSnapshot({ directAnswer: null }), 'direct-answer')).toBe(0);
  });

  it('awards partial marks for an answer with no figure in it', () => {
    expect(
      pointsFor(
        richSnapshot({
          directAnswer:
            'This tent is a great option for people who enjoy hiking in most conditions.',
        }),
        'direct-answer',
      ),
    ).toBe(5);
  });

  it('awards partial marks for an answer too short to stand alone', () => {
    expect(
      pointsFor(richSnapshot({ directAnswer: 'It weighs 3.9 lb.' }), 'direct-answer'),
    ).toBe(5);
  });

  it('awards full marks at exactly the minimum length', () => {
    const answer = `It weighs 3.9 lb${'.'.repeat(DEFAULT_GEO_CONFIG.directAnswerMinChars - 16)}`;
    expect(answer.length).toBe(DEFAULT_GEO_CONFIG.directAnswerMinChars);
    expect(pointsFor(richSnapshot({ directAnswer: answer }), 'direct-answer')).toBe(10);
  });
});

describe('FAQ coverage', () => {
  it('awards nothing with no FAQ', () => {
    expect(pointsFor(richSnapshot({ faq: [] }), 'faq-coverage')).toBe(0);
  });

  it('awards partial marks for a single question', () => {
    expect(
      pointsFor(
        richSnapshot({ faq: [{ question: 'How heavy?', answer: '3.9 lb.' }] }),
        'faq-coverage',
      ),
    ).toBe(5);
  });

  it('ignores pairs with an empty answer', () => {
    expect(
      pointsFor(
        richSnapshot({
          faq: [
            { question: 'How heavy?', answer: '3.9 lb.' },
            { question: 'Is it waterproof?', answer: '   ' },
          ],
        }),
        'faq-coverage',
      ),
    ).toBe(5);
  });
});

describe('heading structure', () => {
  it('awards nothing with no headings', () => {
    expect(pointsFor(richSnapshot({ headings: [] }), 'heading-structure')).toBe(0);
  });

  it('awards partial marks for two H1s', () => {
    const check = checkFor(
      audit(
        richSnapshot({
          headings: [
            { level: 1, text: 'One' },
            { level: 1, text: 'Two' },
            { level: 2, text: 'A' },
            { level: 2, text: 'B' },
          ],
        }),
      ).checks,
      'heading-structure',
    );
    expect(check.points).toBe(5);
    expect(check.message).toContain('2 H1');
  });

  it('awards partial marks when a heading level is skipped', () => {
    const check = checkFor(
      audit(
        richSnapshot({
          headings: [
            { level: 1, text: 'Title' },
            { level: 2, text: 'A' },
            { level: 2, text: 'B' },
            { level: 4, text: 'Skipped' },
          ],
        }),
      ).checks,
      'heading-structure',
    );
    expect(check.points).toBe(5);
    expect(check.message).toContain('skipped heading level');
  });

  it('awards partial marks with too few sections', () => {
    expect(
      pointsFor(
        richSnapshot({ headings: [{ level: 1, text: 'Only a title' }] }),
        'heading-structure',
      ),
    ).toBe(5);
  });
});

describe('factual density', () => {
  it('awards nothing with no facts', () => {
    expect(pointsFor(richSnapshot({ facts: [] }), 'factual-density')).toBe(0);
  });

  it('awards partial marks below the threshold', () => {
    expect(
      pointsFor(
        richSnapshot({ facts: [{ label: 'Weight', value: '3.9 lb' }] }),
        'factual-density',
      ),
    ).toBe(5);
  });

  it('ignores facts with an empty value', () => {
    expect(
      pointsFor(
        richSnapshot({
          facts: [
            { label: 'Weight', value: '3.9 lb' },
            { label: 'Colour', value: '  ' },
            { label: 'Area', value: '29 sq ft' },
            { label: 'Rating', value: '1800 mm' },
          ],
        }),
        'factual-density',
      ),
    ).toBe(5);
  });

  it('awards full marks at exactly the threshold', () => {
    const facts = Array.from(
      { length: DEFAULT_GEO_CONFIG.factsForFull },
      (_, index) => ({ label: `Spec ${index}`, value: `${index} unit` }),
    );
    expect(pointsFor(richSnapshot({ facts }), 'factual-density')).toBe(10);
  });
});

describe('entity clarity', () => {
  it('awards nothing when the brand is never named', () => {
    const check = checkFor(
      audit(
        richSnapshot({
          metaTitle: 'Two Person Backpacking Tent',
          bodyText: 'A freestanding two-person tent weighing 3.9 lb.',
          headings: [
            { level: 1, text: 'Two Person Tent' },
            { level: 2, text: 'Specs' },
            { level: 2, text: 'Care' },
          ],
          faq: [{ question: 'How heavy?', answer: '3.9 lb.' }],
          facts: [{ label: 'Weight', value: '3.9 lb' }],
        }),
        'Vanaheim Gear',
      ).checks,
      'entity-clarity',
    );
    expect(check.points).toBe(0);
  });

  it('awards partial marks when the brand is named but no identifier is published', () => {
    expect(
      pointsFor(richSnapshot({ structuredData: [] }), 'entity-clarity'),
    ).toBe(5);
  });
});

describe('structured product facts', () => {
  it('awards nothing with no Product markup', () => {
    expect(
      pointsFor(richSnapshot({ structuredData: [] }), 'structured-product-facts'),
    ).toBe(0);
  });

  it('awards nothing when markup exists but is a different type', () => {
    expect(
      pointsFor(
        richSnapshot({ structuredData: [{ '@type': 'Article', name: 'x' }] }),
        'structured-product-facts',
      ),
    ).toBe(0);
  });

  it('awards partial marks and names the missing fields', () => {
    const check = checkFor(
      audit(
        richSnapshot({
          structuredData: [
            {
              '@type': 'Product',
              name: 'A tent',
              offers: { price: '329.00', priceCurrency: 'USD' },
            },
          ],
        }),
      ).checks,
      'structured-product-facts',
    );
    expect(check.points).toBe(5);
    expect(check.message).toContain('sku');
    expect(check.message).toContain('availability');
  });

  it('survives malformed markup without throwing', () => {
    expect(() =>
      audit(richSnapshot({ structuredData: [null, 'text', 42, []] })),
    ).not.toThrow();
  });
});

describe('source and evidence', () => {
  it('awards nothing with no sources', () => {
    expect(pointsFor(richSnapshot({ evidence: [] }), 'source-evidence')).toBe(0);
  });

  it('awards partial marks for a source with no link', () => {
    expect(
      pointsFor(
        richSnapshot({ evidence: [{ label: 'Internal testing', url: null }] }),
        'source-evidence',
      ),
    ).toBe(5);
  });

  it('states that a cited source is not necessarily a reliable one', () => {
    expect(
      checkFor(audit(richSnapshot()).checks, 'source-evidence').recommendation,
    ).toContain('nothing about whether it is reliable');
  });
});

describe('original information', () => {
  it('awards nothing without a claim', () => {
    expect(
      pointsFor(richSnapshot({ originalityClaim: null }), 'original-information'),
    ).toBe(0);
  });

  it('awards partial marks for a claim with nothing behind it', () => {
    expect(
      pointsFor(
        richSnapshot({ evidence: [], facts: [] }),
        'original-information',
      ),
    ).toBe(5);
  });

  it('states plainly that originality itself cannot be verified', () => {
    expect(
      checkFor(audit(richSnapshot()).checks, 'original-information')
        .recommendation,
    ).toContain('cannot verify');
  });
});

describe('extractability', () => {
  it('awards nothing when there is nothing liftable', () => {
    expect(
      pointsFor(
        richSnapshot({
          directAnswer: null,
          facts: [],
          faq: [],
          headings: [{ level: 1, text: 'A tent' }],
        }),
        'extractability',
      ),
    ).toBe(0);
  });

  it('penalises unquantified marketing language', () => {
    const check = checkFor(
      audit(
        richSnapshot({
          bodyText: 'The best tent ever made. Amazing in every way.',
        }),
      ).checks,
      'extractability',
    );
    expect(check.points).toBe(5);
    expect(check.evidence).toContain('vague wording');
  });

  it('cannot assess a page with no captured body and no headings', () => {
    expect(
      pointsFor(
        richSnapshot({ bodyText: '', headings: [] }),
        'extractability',
      ),
    ).toBeNull();
  });
});

describe('scoring', () => {
  it('scales earned points over the possible points of evaluable rules', () => {
    // 5 of 10 rules at full marks and 5 at nothing would be 50.
    const summary = scoreGeoChecks([
      ...Array.from({ length: 5 }, (_, i) => ({
        ruleId: `full-${i}`,
        status: 'pass' as const,
        severity: 'info' as const,
        message: 'm',
        explanation: 'e',
        recommendation: 'r',
        evidence: null,
        points: 10,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        ruleId: `none-${i}`,
        status: 'error' as const,
        severity: 'medium' as const,
        message: 'm',
        explanation: 'e',
        recommendation: 'r',
        evidence: null,
        points: 0,
      })),
    ]);
    expect(summary.score).toBe(50);
    expect(summary.earnedPoints).toBe(50);
    expect(summary.possiblePoints).toBe(100);
    expect(summary.coverage).toBe(1);
  });

  it('excludes unevaluable rules from both totals and lowers coverage', () => {
    const summary = scoreGeoChecks([
      {
        ruleId: 'a',
        status: 'pass',
        severity: 'info',
        message: 'm',
        explanation: 'e',
        recommendation: 'r',
        evidence: null,
        points: 10,
      },
      {
        ruleId: 'b',
        status: 'unknown',
        severity: 'info',
        message: 'm',
        explanation: 'e',
        recommendation: 'r',
        evidence: null,
        points: null,
      },
    ]);
    // One rule at full marks scores 100, not 50 — the unknown is not a zero.
    expect(summary.score).toBe(100);
    expect(summary.possiblePoints).toBe(10);
    expect(summary.coverage).toBe(0.5);
  });

  it('returns null when nothing can be evaluated', () => {
    expect(scoreGeoChecks([]).score).toBeNull();
    expect(
      scoreGeoChecks([
        {
          ruleId: 'a',
          status: 'unknown',
          severity: 'info',
          message: 'm',
          explanation: 'e',
          recommendation: 'r',
          evidence: null,
          points: null,
        },
      ]).score,
    ).toBeNull();
  });

  it('stays within 0–100', () => {
    const score = audit(richSnapshot()).score ?? -1;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('readiness bands', () => {
  it('maps scores to bands at the boundaries', () => {
    expect(readinessBand(80).label).toBe('Strong');
    expect(readinessBand(79).label).toBe('Moderate');
    expect(readinessBand(55).label).toBe('Moderate');
    expect(readinessBand(54).label).toBe('Weak');
    expect(readinessBand(30).label).toBe('Weak');
    expect(readinessBand(29).label).toBe('Poor');
    expect(readinessBand(0).label).toBe('Poor');
  });

  it('reports no band for an unscored page', () => {
    expect(readinessBand(null).label).toBe('Not assessed');
  });
});

describe('determinism and a worked example', () => {
  it('produces an identical result for identical input', () => {
    expect(JSON.stringify(audit(richSnapshot()))).toBe(
      JSON.stringify(audit(richSnapshot())),
    );
  });

  it('shows a specific change moving the score by a known amount', () => {
    // Removing the FAQ costs the FAQ rule its 10 points, and drops
    // extractability from 10 to 5 because one liftable structure is gone.
    const before = audit(richSnapshot());
    const after = audit(richSnapshot({ faq: [] }));

    expect(before.score).toBe(100);
    expect(checkFor(after.checks, 'faq-coverage').points).toBe(0);
    expect(checkFor(after.checks, 'extractability').points).toBe(10);
    // 100 - 10 points out of 100 possible = 90.
    expect(after.score).toBe(90);
  });

  it('records the rule version it was produced with', () => {
    expect(audit(richSnapshot()).ruleVersion).toBe('geo-1.0.0');
  });

  it('does not include the product keyword in its fingerprint', () => {
    // GEO never reads the keyword, so its fingerprint must not depend on one.
    const snapshot = richSnapshot();
    expect(runGeoAudit({ snapshot, brand: BRAND, now: NOW }).inputFingerprint).toBe(
      runGeoAudit({ snapshot, brand: 'Another Brand', now: NOW }).inputFingerprint,
    );
  });
});

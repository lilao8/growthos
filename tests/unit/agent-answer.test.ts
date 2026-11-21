import { describe, expect, it } from 'vitest';
import {
  agentAnswerSchema,
  repairRequest,
  validateAnswer,
  type AgentAnswer,
  type AnswerContext,
  type AnswerFinding,
  type CitableRef,
  type KnownFinding,
} from '@/domain/agent/answer';
import { CHANNELS } from '@/domain/types';

const W30 = { start: '2026-08-02', end: '2026-08-31' };
const META_CVR = `channels:2026-08-02..2026-08-31:Meta:all:conversion_rate`;
const META_SESSIONS = `channels:2026-08-02..2026-08-31:Meta:all:sessions`;
const ORGANIC_SESSIONS = `channels:2026-08-02..2026-08-31:Organic Search:all:sessions`;
const SITE_AOV = `channels:2026-08-02..2026-08-31:all:all:average_order_value`;
const SITE_FUNNEL = `funnel:2026-08-02..2026-08-31:all:all:conversion:checkout->purchase`;
const META_FUNNEL = `funnel:2026-08-02..2026-08-31:Meta:all:conversion:checkout->purchase`;
const TENT_VIEWS = `products:2026-08-02..2026-08-31:all:prd_tent:view_sessions`;
const AUDIT = 'audits:seo:snap_tent:h1:abc';

function ref(refId: string, channel: string | null, overrides: Partial<CitableRef> = {}): CitableRef {
  return { refId, label: refId, value: 1, unit: 'count', channel, productId: null, window: W30, funnel: refId.startsWith('funnel:'), href: '/x', ...overrides };
}

function known(id: string, overrides: Partial<KnownFinding> = {}): KnownFinding {
  return {
    id,
    title: `Finding ${id}`,
    priority: 'High',
    strength: 'sufficient',
    affectedSessions: 100,
    observed: 'engine text',
    howToVerify: 'Keep the title under 60 characters.',
    refIds: [],
    href: '/analytics?range=30',
    ...overrides,
  };
}

function context(overrides: Partial<AnswerContext> = {}): AnswerContext {
  return {
    refs: new Map([
      [META_CVR, ref(META_CVR, 'Meta', { unit: 'ratio' })],
      [META_SESSIONS, ref(META_SESSIONS, 'Meta')],
      [ORGANIC_SESSIONS, ref(ORGANIC_SESSIONS, 'Organic Search')],
      [SITE_AOV, ref(SITE_AOV, null, { unit: 'cents' })],
      [SITE_FUNNEL, ref(SITE_FUNNEL, null)],
      [META_FUNNEL, ref(META_FUNNEL, 'Meta')],
      [TENT_VIEWS, ref(TENT_VIEWS, null, { productId: 'prd_tent' })],
    ]),
    comparisons: new Map([
      [META_CVR, { currentRefId: META_CVR, previousRefId: 'p', current: 0.01, previous: 0.02, relativeChange: -0.5, direction: 'down', supportsConclusion: true }],
      [META_SESSIONS, { currentRefId: META_SESSIONS, previousRefId: 'p', current: 1, previous: 2, relativeChange: -0.5, direction: 'down', supportsConclusion: false }],
    ]),
    audits: new Map([[AUDIT, { refId: AUDIT, ruleId: 'h1', status: 'error', evidence: '0 H1', productId: 'prd_tent', href: '/seo/snap_tent?preview=1' }]]),
    findings: new Map([
      ['f1', known('f1')],
      ['f2', known('f2')],
      ['thin', known('thin', { strength: 'insufficient' })],
    ]),
    products: new Map([['prd_tent', 'Ridgeline 2P Backpacking Tent']]),
    channels: [...CHANNELS],
    ...overrides,
  };
}

function finding(overrides: Partial<AnswerFinding> = {}): AnswerFinding {
  return {
    basedOn: 'f1',
    facts: [{ kind: 'value', refId: META_CVR }, { kind: 'value', refId: META_SESSIONS }],
    whyPriority: 'Paid traffic on Meta that is not converting.',
    howToVerify: 'Compare the landing pages with the ads.',
    scope: { channel: 'Meta', productId: null },
    ...overrides,
  };
}

function answer(findings: AnswerFinding[], summary = 'Two things to check.', gaps: string[] = []): AgentAnswer {
  return { summary, findings, gaps };
}

function codes(result: ReturnType<typeof validateAnswer>): string[] {
  return result.map((issue) => issue.code);
}

describe('facts', () => {
  it('accepts value facts for returned figures in the finding scope', () => {
    expect(validateAnswer(answer([finding()]), context())).toEqual([]);
  });

  it('accepts a figure whose id contains a space, such as an Organic Search figure', () => {
    const organic = finding({ facts: [{ kind: 'value', refId: ORGANIC_SESSIONS }], whyPriority: 'Organic Search matters.', scope: { channel: 'Organic Search', productId: null } });
    expect(validateAnswer(answer([organic]), context())).toEqual([]);
  });

  it('rejects a fact for a figure no tool returned', () => {
    const result = validateAnswer(answer([finding({ facts: [{ kind: 'value', refId: 'channels:made-up' }] })]), context());
    expect(codes(result)).toEqual(['unknown-ref']);
    expect(result[0]?.finding).toBe(0);
  });

  it('accepts a change fact whose direction matches and whose sample supports it', () => {
    expect(validateAnswer(answer([finding({ facts: [{ kind: 'change', refId: META_CVR, direction: 'down' }] })]), context())).toEqual([]);
  });

  it('rejects a change in the wrong direction', () => {
    const result = validateAnswer(answer([finding({ facts: [{ kind: 'change', refId: META_CVR, direction: 'up' }] })]), context());
    expect(codes(result)).toEqual(['wrong-direction']);
    expect(result[0]?.message).toContain('moved down, not up');
  });

  it('rejects a change whose sample cannot support a conclusion, and one with no comparison', () => {
    expect(codes(validateAnswer(answer([finding({ facts: [{ kind: 'change', refId: META_SESSIONS, direction: 'down' }] })]), context()))).toEqual(['unsupported-change']);
    expect(codes(validateAnswer(answer([finding({ facts: [{ kind: 'change', refId: META_FUNNEL, direction: 'down' }] })]), context()))).toEqual(['unknown-change']);
  });

  it('lets a product finding cite an audit verdict that belongs to no product', () => {
    const pageAudit = 'audits:seo:snap_home:h1:def';
    const ctx = context({ audits: new Map([[pageAudit, { refId: pageAudit, ruleId: 'h1', status: 'error', evidence: null, productId: null, href: '/seo/snap_home?preview=1' }]]) });
    const cited = finding({ facts: [{ kind: 'audit', refId: pageAudit }], whyPriority: 'A missing heading.', scope: { channel: null, productId: 'prd_tent' } });
    expect(validateAnswer(answer([cited]), ctx)).toEqual([]);
  });

  it('accepts a returned audit verdict for the right product, and rejects others', () => {
    const tent = { channel: null, productId: 'prd_tent' };
    expect(validateAnswer(answer([finding({ facts: [{ kind: 'audit', refId: AUDIT }], whyPriority: 'A missing heading.', scope: tent })]), context())).toEqual([]);
    expect(codes(validateAnswer(answer([finding({ facts: [{ kind: 'audit', refId: 'audits:nope' }], whyPriority: 'x', scope: tent })]), context()))).toEqual(['unknown-audit']);
    expect(codes(validateAnswer(answer([finding({ facts: [{ kind: 'audit', refId: AUDIT }], whyPriority: 'x', scope: { channel: null, productId: null } })]), context()))).toEqual(['scope-mismatch']);
  });
});

describe('scope', () => {
  it('rejects a Meta figure in an Organic Search finding', () => {
    const wrong = finding({ facts: [{ kind: 'value', refId: META_FUNNEL }], whyPriority: 'Checkout loses sessions.', scope: { channel: 'Organic Search', productId: null } });
    expect(codes(validateAnswer(answer([wrong]), context()))).toEqual(['scope-mismatch']);
  });

  it('rejects a channel figure presented as site-wide', () => {
    const wrong = finding({ facts: [{ kind: 'value', refId: META_CVR }], whyPriority: 'Conversion is low.', scope: { channel: null, productId: null } });
    expect(codes(validateAnswer(answer([wrong]), context()))).toEqual(['scope-mismatch']);
  });

  it('lets a channel finding cite a site figure that is not a funnel figure', () => {
    const cac = finding({ facts: [{ kind: 'value', refId: META_CVR }, { kind: 'value', refId: SITE_AOV }] });
    expect(validateAnswer(answer([cac]), context())).toEqual([]);
  });

  it('does not let the site funnel stand in for a channel, whether in the facts or in the basis', () => {
    expect(codes(validateAnswer(answer([finding({ facts: [{ kind: 'value', refId: SITE_FUNNEL }] })]), context()))).toEqual(['site-funnel-for-narrow-scope']);
    const ctx = context({ findings: new Map([['f1', known('f1', { refIds: [SITE_FUNNEL] })]]) });
    expect(codes(validateAnswer(answer([finding()]), ctx))).toEqual(['site-funnel-for-narrow-scope']);
    expect(validateAnswer(answer([finding({ facts: [{ kind: 'value', refId: META_FUNNEL }] })]), context())).toEqual([]);
  });

  it('does not let any funnel figure support a claim about one product', () => {
    const product = finding({ facts: [{ kind: 'value', refId: TENT_VIEWS }, { kind: 'value', refId: SITE_FUNNEL }], whyPriority: 'x', scope: { channel: null, productId: 'prd_tent' } });
    expect(codes(validateAnswer(answer([product]), context()))).toEqual(['funnel-for-product']);
  });

  it('rejects a product figure in a finding about another product or none', () => {
    const other = finding({ facts: [{ kind: 'value', refId: TENT_VIEWS }], whyPriority: 'x', scope: { channel: null, productId: 'prd_bag' } });
    expect(codes(validateAnswer(answer([other]), context()))).toEqual(['scope-mismatch']);
  });

  it('rejects prose naming a channel other than the finding scope', () => {
    const wrong = finding({ whyPriority: 'Organic Search is converting poorly.' });
    expect(codes(validateAnswer(answer([wrong]), context()))).toEqual(['scope-mismatch']);
  });

  it('reads "AI Referral" as one channel, not also as "Referral"', () => {
    const ai = `channels:2026-08-02..2026-08-31:AI Referral:all:sessions`;
    const ctx = context({ refs: new Map([[ai, ref(ai, 'AI Referral')]]) });
    const own = finding({ facts: [{ kind: 'value', refId: ai }], whyPriority: 'AI Referral sends few sessions.', scope: { channel: 'AI Referral', productId: null } });
    expect(validateAnswer(answer([own]), ctx)).toEqual([]);
  });

  it('reads a channel named twice once, so "AI Referral" never leaves "Referral" behind', () => {
    const ai = `channels:2026-08-02..2026-08-31:AI Referral:all:sessions`;
    const ctx = context({ refs: new Map([[ai, ref(ai, 'AI Referral')]]) });
    const own = finding({ facts: [{ kind: 'value', refId: ai }], whyPriority: 'AI Referral is small, and AI Referral is new.', scope: { channel: 'AI Referral', productId: null } });
    expect(validateAnswer(answer([own]), ctx)).toEqual([]);
  });

  it('says "all channels" when a site-wide finding names a channel', () => {
    const site = finding({ facts: [{ kind: 'value', refId: SITE_AOV }], whyPriority: 'Meta pulls the average down.', scope: { channel: null, productId: null } });
    const result = validateAnswer(answer([site]), context());
    expect(codes(result)).toEqual(['scope-mismatch']);
    expect(result[0]?.message).toBe('The text names Meta, but the finding is about all channels.');
  });

  it('allows the summary to name several channels', () => {
    expect(validateAnswer(answer([], 'Meta and Organic Search both need a look.'), context())).toEqual([]);
  });
});

describe('prose', () => {
  it('rejects every digit in every prose field, including window lengths and dates', () => {
    expect(codes(validateAnswer(answer([], 'Conversion was 0.54% on 372 sessions.'), context()))).toEqual(['raw-number', 'raw-number']);
    expect(codes(validateAnswer(answer([], 'Over the last 30 days things look fine.'), context()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], 'From 2026-08-02 onward.'), context()))).toEqual(['raw-number', 'raw-number', 'raw-number']);
    expect(codes(validateAnswer(answer([], 'S', ['About 999 sessions are missing.']), context()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([finding({ whyPriority: 'Conversion is 30% here.' })]), context()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([finding({ howToVerify: 'Keep the title under 60 characters.' })]), context()))).toEqual(['raw-number']);
  });

  it('names a product only through its placeholder', () => {
    expect(validateAnswer(answer([], 'Look at {{product:prd_tent}} first.'), context())).toEqual([]);
    expect(codes(validateAnswer(answer([], 'Look at Ridgeline 2P first.'), context()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], 'Look at {{product:prd_ghost}}.'), context()))).toEqual(['unknown-product']);
  });

  it('rejects any other placeholder in prose, and does not join the digits around it', () => {
    expect(codes(validateAnswer(answer([], 'It is {{ref:x}}.'), context()))).toEqual(['placeholder-in-prose']);
    expect(codes(validateAnswer(answer([], '1{{ref:x}}2'), context()))).toEqual(['placeholder-in-prose', 'raw-number', 'raw-number']);
  });

  it.each([
    'fell', 'fall', 'falls', 'falling', 'rise', 'grow', 'rises', 'rising', 'declined', 'decreased', 'increased', 'grew', 'grows', 'worsened', 'improved',
    'weaker', 'stronger', 'down from', 'up from', 'than last', 'previous period', 'last month', '下降', '下滑', '增长', '环比', '上月', '变弱', '前期',
  ])('treats "%s" in prose as a change claim', (word) => {
    expect(codes(validateAnswer(answer([], `Meta conversion ${word} here.`), context()))).toEqual(['change-in-prose']);
  });

  it('checks change claims in whyPriority and gaps, but lets advice talk about improving', () => {
    expect(codes(validateAnswer(answer([finding({ whyPriority: 'Conversion fell on Meta.' })]), context()))).toEqual(['change-in-prose']);
    expect(codes(validateAnswer(answer([], 'S', ['Conversion fell.']), context()))).toEqual(['change-in-prose']);
    expect(validateAnswer(answer([finding({ howToVerify: 'Check whether conversion improves.' })]), context())).toEqual([]);
  });

  it('does not treat "drop-off" as a change claim', () => {
    expect(validateAnswer(answer([], 'The largest drop-off is at checkout.'), context())).toEqual([]);
  });

  it('does not join digits on either side of a placeholder into one number', () => {
    expect(codes(validateAnswer(answer([], '1{{product:prd_tent}}2'), context()))).toEqual(['raw-number', 'raw-number']);
  });
});

describe('basis', () => {
  it('requires each finding to rest on a returned, sufficient, unused tool finding', () => {
    expect(codes(validateAnswer(answer([finding({ basedOn: 'invented' })]), context()))).toEqual(['unknown-basis']);
    expect(codes(validateAnswer(answer([finding({ basedOn: 'thin' })]), context()))).toEqual(['insufficient-basis']);
    expect(codes(validateAnswer(answer([finding(), finding()]), context()))).toEqual(['duplicate-basis']);
  });
});

describe('answer schema and repair', () => {
  const base = { basedOn: 'f', facts: [{ kind: 'value', refId: 'r' }], whyPriority: 'w', howToVerify: 'h', scope: { channel: null, productId: null } };
  const parses = (value: object) => agentAnswerSchema.safeParse({ summary: 's', findings: [value], gaps: [] }).success;

  it('bounds every finding field and rejects unknown ones', () => {
    expect(parses(base)).toBe(true);
    for (const direction of ['up', 'down', 'flat']) expect(parses({ ...base, facts: [{ kind: 'change', refId: 'r', direction }] })).toBe(true);
    expect(parses({ ...base, facts: [{ kind: 'audit', refId: 'r' }] })).toBe(true);
    expect(parses({ ...base, facts: [{ kind: 'note', refId: 'r' }] })).toBe(false);
    expect(parses({ ...base, basedOn: '' })).toBe(false);
    expect(parses({ ...base, basedOn: 'x'.repeat(301) })).toBe(false);
    expect(parses({ ...base, basedOn: 'x'.repeat(300) })).toBe(true);
    expect(parses({ ...base, facts: [] })).toBe(false);
    expect(parses({ ...base, facts: Array(7).fill(base.facts[0]) })).toBe(false);
    expect(parses({ ...base, facts: [{ kind: 'change', refId: 'r' }] })).toBe(false);
    expect(parses({ ...base, facts: [{ kind: 'change', refId: 'r', direction: 'sideways' }] })).toBe(false);
    expect(parses({ ...base, facts: [{ kind: 'value', refId: 'r', note: 'x' }] })).toBe(false);
    expect(parses({ ...base, facts: [{ kind: 'audit', refId: '' }] })).toBe(false);
    expect(parses({ ...base, whyPriority: '   ' })).toBe(false);
    expect(parses({ ...base, howToVerify: 'x'.repeat(1201) })).toBe(false);
    expect(parses({ ...base, scope: { channel: 'x'.repeat(41), productId: null } })).toBe(false);
    expect(parses({ ...base, scope: { channel: 'Meta', productId: 'x'.repeat(81) } })).toBe(false);
    expect(parses({ ...base, scope: { channel: null, productId: null, extra: 1 } })).toBe(false);
    expect(parses({ ...base, title: 'the model may not title findings' })).toBe(false);
  });

  it('allows at most eight findings and eight gaps', () => {
    expect(agentAnswerSchema.safeParse({ summary: 's', findings: Array(9).fill(base), gaps: [] }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: 's', findings: [], gaps: Array(9).fill('g') }).success).toBe(false);
  });

  it('lists every issue on its own line with where it is', () => {
    const text = repairRequest([
      { finding: null, code: 'raw-number', message: 'a' },
      { finding: 2, code: 'unknown-ref', message: 'b' },
    ]);
    expect(text.split('\n')).toEqual([
      'Your answer did not pass validation. Fix every item and reply with the corrected JSON only.',
      '- summary or gaps (raw-number): a',
      '- findings[2] (unknown-ref): b',
    ]);
  });
});

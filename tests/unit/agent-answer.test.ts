import { describe, expect, it } from 'vitest';
import {
  agentAnswerSchema,
  repairRequest,
  validateAnswer,
  type AgentAnswer,
  type AnswerContext,
  type AnswerFact,
  type AnswerFinding,
  type CitableRef,
  type KnownFinding,
} from '@/domain/agent/answer';

const W30 = { start: '2026-08-02', end: '2026-08-31' };
const META_CVR = 'channels:2026-08-02..2026-08-31:Meta:all:conversion_rate';
const META_SESSIONS = 'channels:2026-08-02..2026-08-31:Meta:all:sessions';
const ORGANIC_SESSIONS = 'channels:2026-08-02..2026-08-31:Organic Search:all:sessions';
const SITE_AOV = 'channels:2026-08-02..2026-08-31:all:all:average_order_value';
const SITE_FUNNEL = 'funnel:2026-08-02..2026-08-31:all:all:conversion:checkout->purchase';
const META_FUNNEL = 'funnel:2026-08-02..2026-08-31:Meta:all:conversion:checkout->purchase';
const TENT_VIEWS = 'products:2026-08-02..2026-08-31:all:prd_tent:view_sessions';
const AUDIT_2P = 'audits:seo:snap_tent:h1:abc';
const AUDIT_3P = 'audits:seo:snap_tent3:h1:def';
const AUDIT_PAGE = 'audits:seo:snap_home:h1:ghi';

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
    sampleLabel: 'sessions that entered this step',
    lostSessions: null,
    observed: 'engine text',
    howToVerify: 'Keep the title under 60 characters.',
    refIds: [],
    href: '/analytics?range=30',
    scope: { channel: 'Meta', productId: null },
    ...overrides,
  };
}

function context(overrides: Partial<AnswerContext> = {}): AnswerContext {
  const audit = (refId: string, productId: string | null) => ({ refId, ruleId: 'h1', status: 'error', evidence: '0 H1', productId, pageLabel: productId ?? 'page snap_home', href: '/seo/x?preview=1' });
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
    audits: new Map([
      [AUDIT_2P, audit(AUDIT_2P, 'prd_tent')],
      [AUDIT_3P, audit(AUDIT_3P, 'prd_tent3')],
      [AUDIT_PAGE, audit(AUDIT_PAGE, null)],
    ]),
    findings: new Map([
      ['meta', known('meta')],
      ['meta2', known('meta2')],
      ['organic', known('organic', { scope: { channel: 'Organic Search', productId: null } })],
      ['site', known('site', { scope: { channel: null, productId: null } })],
      ['tent', known('tent', { scope: { channel: null, productId: 'prd_tent' } })],
      ['thin', known('thin', { strength: 'insufficient' })],
    ]),
    products: new Map([['prd_tent', 'Ridgeline 2P Backpacking Tent']]),
    figuresWithoutFindings: [],
    ...overrides,
  };
}

/** A context whose only rankable finding is the one named, plus the thin one. */
function only(id: string, overrides: Partial<AnswerContext> = {}): AnswerContext {
  const all = context().findings;
  return context({ findings: new Map([[id, all.get(id)!], ['thin', all.get('thin')!]]), ...overrides });
}

/** A context in which the tools raised no finding: a lookup. */
function bare(overrides: Partial<AnswerContext> = {}): AnswerContext {
  return context({ findings: new Map(), ...overrides });
}

function finding(overrides: Partial<AnswerFinding> = {}): AnswerFinding {
  return {
    basedOn: 'meta',
    facts: [{ kind: 'value', refId: META_CVR }, { kind: 'value', refId: META_SESSIONS }],
    whyPriority: 'Paid traffic that is not converting.',
    howToVerify: 'Compare the landing pages with the ads.',
    ...overrides,
  };
}

function answer(findings: AnswerFinding[], summary = 'Two things to check.', gaps: string[] = [], facts: AnswerFact[] = []): AgentAnswer {
  return { summary, facts, findings, gaps };
}

function codes(result: ReturnType<typeof validateAnswer>): string[] {
  return result.map((issue) => issue.code);
}

describe('facts inside findings', () => {
  it('accepts value facts for returned figures inside the basis scope', () => {
    expect(validateAnswer(answer([finding()]), context())).toEqual([]);
  });

  it('accepts a figure whose id contains a space, such as an Organic Search figure', () => {
    const organic = finding({ basedOn: 'organic', facts: [{ kind: 'value', refId: ORGANIC_SESSIONS }] });
    expect(validateAnswer(answer([organic]), only('organic'))).toEqual([]);
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

  it('rejects an audit verdict no tool returned', () => {
    expect(codes(validateAnswer(answer([finding({ basedOn: 'tent', facts: [{ kind: 'audit', refId: 'audits:nope' }] })]), only('tent')))).toEqual(['unknown-audit']);
  });
});

describe('scope comes from the basis', () => {
  it("rejects another product's audit on a product finding (2P basis, 3P evidence)", () => {
    const mixed = finding({ basedOn: 'tent', facts: [{ kind: 'audit', refId: AUDIT_2P }, { kind: 'audit', refId: AUDIT_3P }] });
    const result = validateAnswer(answer([mixed]), only('tent'));
    expect(codes(result)).toEqual(['scope-mismatch']);
    expect(result[0]?.message).toContain('prd_tent3');
  });

  it('lets a product finding cite an audit verdict that belongs to no product', () => {
    expect(validateAnswer(answer([finding({ basedOn: 'tent', facts: [{ kind: 'audit', refId: AUDIT_PAGE }] })]), only('tent'))).toEqual([]);
  });

  it('rejects a Meta figure in an Organic Search finding', () => {
    const wrong = finding({ basedOn: 'organic', facts: [{ kind: 'value', refId: META_FUNNEL }] });
    expect(codes(validateAnswer(answer([wrong]), only('organic')))).toEqual(['scope-mismatch']);
  });

  it('rejects a channel figure in a site-wide finding', () => {
    const wrong = finding({ basedOn: 'site', facts: [{ kind: 'value', refId: META_CVR }] });
    const result = validateAnswer(answer([wrong]), only('site'));
    expect(codes(result)).toEqual(['scope-mismatch']);
    expect(result[0]?.message).toContain('all channels');
  });

  it('lets a channel finding cite a site figure that is not a funnel figure, as a benchmark', () => {
    expect(validateAnswer(answer([finding({ facts: [{ kind: 'value', refId: META_CVR }, { kind: 'value', refId: SITE_AOV }] })]), context())).toEqual([]);
  });

  it('does not let the site funnel stand in for a channel, in the facts or in the basis', () => {
    expect(codes(validateAnswer(answer([finding({ facts: [{ kind: 'value', refId: SITE_FUNNEL }] })]), context()))).toEqual(['site-funnel-for-narrow-scope']);
    const ctx = context({ findings: new Map([['meta', known('meta', { refIds: [SITE_FUNNEL] })]]) });
    expect(codes(validateAnswer(answer([finding()]), ctx))).toEqual(['site-funnel-for-narrow-scope']);
    expect(validateAnswer(answer([finding({ facts: [{ kind: 'value', refId: META_FUNNEL }] })]), context())).toEqual([]);
  });

  it('ignores a basis figure it cannot resolve rather than failing', () => {
    const ctx = context({ findings: new Map([['meta', known('meta', { refIds: ['channels:gone'] })]]) });
    expect(validateAnswer(answer([finding()]), ctx)).toEqual([]);
  });

  it('does not let any funnel figure support a claim about one product', () => {
    const product = finding({ basedOn: 'tent', facts: [{ kind: 'value', refId: TENT_VIEWS }, { kind: 'value', refId: SITE_FUNNEL }] });
    expect(codes(validateAnswer(answer([product]), only('tent')))).toEqual(['funnel-for-product']);
  });

  it('rejects a product figure in a finding about no single product', () => {
    expect(codes(validateAnswer(answer([finding({ basedOn: 'site', facts: [{ kind: 'value', refId: TENT_VIEWS }] })]), only('site')))).toEqual(['scope-mismatch']);
  });

  it('judges channel scope from the structured scope, not from words: "Direct answer" is fine', () => {
    expect(validateAnswer(answer([finding({ whyPriority: 'Direct answer availability is weak on this page.' })]), context())).toEqual([]);
  });
});

describe('standalone facts', () => {
  it('accepts a figure that answers a lookup without any finding', () => {
    expect(validateAnswer(answer([], 'Here is the figure.', [], [{ kind: 'value', refId: TENT_VIEWS }]), bare())).toEqual([]);
  });

  it('accepts an audit verdict on its own, with no finding scope to check it against', () => {
    expect(validateAnswer(answer([], 'S', [], [{ kind: 'audit', refId: AUDIT_3P }]), bare())).toEqual([]);
  });

  it('still rejects unknown figures and wrong directions there', () => {
    const facts: AnswerFact[] = [{ kind: 'value', refId: 'nope' }, { kind: 'change', refId: META_CVR, direction: 'up' }];
    const result = validateAnswer(answer([], 'S', [], facts), bare());
    expect(codes(result)).toEqual(['unknown-ref', 'wrong-direction']);
    expect(result.every((issue) => issue.finding === null)).toBe(true);
  });
});

describe('prose', () => {
  it('rejects every digit in every prose field, including window lengths and dates', () => {
    expect(codes(validateAnswer(answer([], 'Conversion was 0.54% on 372 sessions.'), bare()))).toEqual(['raw-number', 'raw-number']);
    expect(codes(validateAnswer(answer([], 'Over the last 30 days things look fine.'), bare()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], 'From 2026-08-02 onward.'), bare()))).toEqual(['raw-number', 'raw-number', 'raw-number']);
    expect(codes(validateAnswer(answer([], 'S', ['About 999 sessions are missing.']), bare()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([finding({ whyPriority: 'Conversion is 30% here.' })]), context()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([finding({ howToVerify: 'Keep the title under 60 characters.' })]), context()))).toEqual(['raw-number']);
  });

  it('catches full-width digits and figures written in words', () => {
    expect(codes(validateAnswer(answer([], '转化率约为３０％。'), bare()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], '转化率只有百分之三。'), bare()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], '本期有三十次购买。'), bare()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], 'About three percent convert.'), bare()))).toEqual(['raw-number']);
    // A numeral next to a metric unit is a figure, in either language…
    for (const text of ['本期只有三笔订单。', '大约两千个会话。', '共有五位顾客。', 'Only three orders came in.', 'About twenty-five sessions.', 'Roughly a few hundred visitors.']) {
      expect(codes(validateAnswer(answer([], text), bare())), text).toEqual(['raw-number']);
    }
    // …while a lone numeral in ordinary speech is not.
    for (const text of ['建议再检查一次落地页。', '先看一个渠道。', 'Check one page at a time.']) {
      expect(validateAnswer(answer([], text), bare()), text).toEqual([]);
    }
  });

  it('tells the model when a refused number is step numbering', () => {
    const numbered = validateAnswer(answer([], '按以下步骤核查：1. 检查运费；2. 检查支付方式。'), bare());
    expect(codes(numbered)).toEqual(['raw-number', 'raw-number']);
    expect(numbered[0]?.message).toContain('"1." numbers a step');
    expect(numbered[1]?.message).toContain('"2." numbers a step');
    expect(validateAnswer(answer([], '第1步检查运费。'), bare())[0]?.message).toContain('"1步" numbers a step');
    const figure = validateAnswer(answer([], 'Conversion was 3.5 here.'), bare());
    expect(figure[0]?.message).toContain('is a number in prose');
  });

  it('names a product only through its placeholder', () => {
    expect(validateAnswer(answer([], 'Look at {{product:prd_tent}} first.'), bare())).toEqual([]);
    expect(codes(validateAnswer(answer([], 'Look at Ridgeline 2P first.'), bare()))).toEqual(['raw-number']);
    expect(codes(validateAnswer(answer([], 'Look at {{product:prd_ghost}}.'), bare()))).toEqual(['unknown-product']);
  });

  it('rejects any other placeholder in prose, and does not join the digits around it', () => {
    expect(codes(validateAnswer(answer([], 'It is {{ref:x}}.'), bare()))).toEqual(['placeholder-in-prose']);
    expect(codes(validateAnswer(answer([], '1{{ref:x}}2'), bare()))).toEqual(['placeholder-in-prose', 'raw-number', 'raw-number']);
    expect(codes(validateAnswer(answer([], '1{{product:prd_tent}}2'), bare()))).toEqual(['raw-number', 'raw-number']);
  });

  it.each([
    'fell', 'fall', 'falls', 'falling', 'rise', 'rises', 'rising', 'declined', 'decreased', 'increased', 'grew', 'grow', 'grows',
    'worsened', 'improved', 'weaker', 'stronger', 'down from', 'up from', 'than last', 'previous period', 'last month',
    '下降', '下滑', '增长', '环比', '上月', '变弱', '前期', '不及从前', '不如以前', '比之前',
    '表现走弱', '走强', '恶化', '好转', '回升', 'weakening', 'deteriorated', 'recovered', 'slipped', 'surged',
  ])('treats "%s" in prose as a change claim', (word) => {
    expect(codes(validateAnswer(answer([], `Meta conversion ${word} here.`), bare()))).toEqual(['change-in-prose']);
  });

  it('checks change claims in whyPriority and gaps, but lets advice talk about improving', () => {
    expect(codes(validateAnswer(answer([finding({ whyPriority: 'Conversion fell.' })]), context()))).toEqual(['change-in-prose']);
    expect(codes(validateAnswer(answer([], 'S', ['Conversion fell.']), bare()))).toEqual(['change-in-prose']);
    expect(validateAnswer(answer([finding({ howToVerify: 'Check whether conversion improves.' })]), context())).toEqual([]);
  });

  it('does not treat "drop-off" as a change claim', () => {
    expect(validateAnswer(answer([], 'The largest drop-off is at checkout.'), bare())).toEqual([]);
  });

  it('refuses any claim that an action was carried out, with or without a tool call', () => {
    for (const claim of ['已把这条建议标记为完成。', '已把这条建议标为完成。', '已经帮你暂停了这个广告组。', '已更新出价。', 'The recommendation has been marked done.', 'I have paused the campaign.', "We've updated the bid.", 'It is now marked complete.']) {
      expect(codes(validateAnswer(answer([], claim), bare())), claim).toEqual(['action-claim']);
    }
    expect(codes(validateAnswer(answer([finding({ whyPriority: 'I updated the bid.' })]), context()))).toEqual(['action-claim']);
  });

  it('does not mistake a description of the data for an action', () => {
    for (const text of ['已完成结账的会话流失最多。', 'Sessions that completed checkout are few.', 'Orders were completed by returning customers.', 'Nothing can be changed from here.']) {
      expect(validateAnswer(answer([], text), bare()), text).toEqual([]);
    }
  });
});

describe('ranked findings are not dropped', () => {
  it('requires findings when the tools raised any, and lets a lookup answer with figures alone', () => {
    const factOnly = answer([], 'Here is one figure.', [], [{ kind: 'value', refId: META_CVR }]);
    expect(codes(validateAnswer(factOnly, context()))).toEqual(['findings-omitted']);
    expect(validateAnswer(factOnly, bare())).toEqual([]);
  });

  it('does not count a thin finding as one that must be shown', () => {
    expect(validateAnswer(answer([], 'S'), bare({ findings: new Map([['thin', context().findings.get('thin')!]]) }))).toEqual([]);
  });

  it('requires the finding GrowthOS ranks first', () => {
    const ctx = context({ findings: new Map([['meta', known('meta', { priority: 'Critical' })], ['meta2', known('meta2')]]) });
    const result = validateAnswer(answer([finding({ basedOn: 'meta2' })]), ctx);
    expect(codes(result)).toEqual(['top-finding-omitted']);
    expect(result[0]?.message).toContain('"meta"');
    expect(validateAnswer(answer([finding({ basedOn: 'meta' })]), ctx)).toEqual([]);
    // The top finding alongside others is fine; only its absence is not.
    expect(validateAnswer(answer([finding({ basedOn: 'meta2' }), finding({ basedOn: 'meta' })]), ctx)).toEqual([]);
  });
});

describe('basis', () => {
  it('requires each finding to rest on a returned, sufficient, unused tool finding', () => {
    expect(codes(validateAnswer(answer([finding({ basedOn: 'invented' })]), bare()))).toEqual(['unknown-basis']);
    const thinOnly = bare({ findings: new Map([['thin', context().findings.get('thin')!]]) });
    expect(codes(validateAnswer(answer([finding({ basedOn: 'thin' })]), thinOnly))).toEqual(['insufficient-basis']);
    expect(codes(validateAnswer(answer([finding(), finding()]), context()))).toEqual(['duplicate-basis']);
  });
});

describe('answer schema and repair', () => {
  const base = { basedOn: 'f', facts: [{ kind: 'value', refId: 'r' }], whyPriority: 'w', howToVerify: 'h' };
  const parses = (value: object) => agentAnswerSchema.safeParse({ summary: 's', facts: [], findings: [value], gaps: [] }).success;

  it('bounds every finding field and rejects unknown ones, including a model-written scope or title', () => {
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
    expect(parses({ ...base, scope: { channel: null, productId: null } })).toBe(false);
    expect(parses({ ...base, title: 'the model may not title findings' })).toBe(false);
  });

  it('requires top-level facts, and bounds them, the findings and the gaps', () => {
    expect(agentAnswerSchema.safeParse({ summary: 's', findings: [], gaps: [] }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: 's', facts: Array(13).fill(base.facts[0]), findings: [], gaps: [] }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: 's', facts: Array(12).fill(base.facts[0]), findings: [], gaps: [] }).success).toBe(true);
    expect(agentAnswerSchema.safeParse({ summary: 's', facts: [], findings: Array(9).fill(base), gaps: [] }).success).toBe(false);
    expect(agentAnswerSchema.safeParse({ summary: 's', facts: [], findings: [], gaps: Array(9).fill('g') }).success).toBe(false);
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

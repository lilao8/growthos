import { describe, expect, it } from 'vitest';
import {
  buildFunnel,
  findLargestDropOff,
  validateStageSequence,
  type FunnelTransition,
} from '@/domain/funnel/funnel-metrics';
import { buildWindow } from '@/domain/demo-window';
import type { FunnelStage, SessionFact } from '@/domain/types';

const WINDOW = buildWindow(7, '2026-08-31');

let counter = 0;

function session(
  stages: FunnelStage[],
  overrides: Partial<SessionFact> = {},
): SessionFact {
  counter += 1;
  return {
    sessionId: `ses_${counter}`,
    userId: `usr_${counter}`,
    date: '2026-08-30',
    channel: 'Direct',
    source: '(direct)',
    landingPageId: 'snap_a',
    stages,
    viewedProductIds: stages.includes('product_view') ? ['prd_a'] : [],
    orderId: stages.includes('purchase') ? `ord_${counter}` : null,
    ...overrides,
  };
}

const ALL: FunnelStage[] = [
  'session',
  'product_view',
  'add_to_cart',
  'checkout',
  'purchase',
];

function report(sessions: SessionFact[]) {
  return buildFunnel({ sessions, window: WINDOW });
}

function transitionFor(
  transitions: readonly FunnelTransition[],
  from: FunnelStage,
): FunnelTransition {
  const found = transitions.find((item) => item.from === from);
  if (found === undefined) throw new Error(`No transition from ${from}`);
  return found;
}

describe('validateStageSequence', () => {
  it('accepts an ordered prefix', () => {
    expect(validateStageSequence(['session'])).toBeNull();
    expect(validateStageSequence(['session', 'product_view'])).toBeNull();
    expect(validateStageSequence(ALL)).toBeNull();
  });

  it('rejects a sequence that skips a stage', () => {
    expect(validateStageSequence(['session', 'add_to_cart'])).toBe('out-of-order');
  });

  it('rejects a sequence out of order', () => {
    expect(
      validateStageSequence(['session', 'add_to_cart', 'product_view']),
    ).toBe('out-of-order');
  });

  it('rejects a sequence that does not start at session', () => {
    expect(validateStageSequence(['product_view'])).toBe('out-of-order');
  });

  it('rejects a repeated stage', () => {
    expect(validateStageSequence(['session', 'session'])).toBe('duplicate-stage');
  });

  it('rejects an empty sequence', () => {
    expect(validateStageSequence([])).toBe('empty');
  });
});

describe('a normal funnel', () => {
  const sessions = [
    ...Array.from({ length: 40 }, () => session(['session'])),
    ...Array.from({ length: 30 }, () => session(['session', 'product_view'])),
    ...Array.from({ length: 20 }, () =>
      session(['session', 'product_view', 'add_to_cart']),
    ),
    ...Array.from({ length: 6 }, () =>
      session(['session', 'product_view', 'add_to_cart', 'checkout']),
    ),
    ...Array.from({ length: 4 }, () => session(ALL)),
  ];

  it('counts each layer as the sessions that reached it', () => {
    const result = report(sessions);
    expect(result.stages.map((row) => row.sessions)).toEqual([
      100, 60, 30, 10, 4,
    ]);
  });

  it('is monotonically non-increasing', () => {
    expect(report(sessions).monotonic).toBe(true);
  });

  it('computes stage conversion and drop-off as complements', () => {
    const result = report(sessions);
    const first = transitionFor(result.transitions, 'session');
    expect(first.conversion).toBe(0.6);
    expect(first.dropOffRate).toBeCloseTo(0.4, 10);
    expect(first.dropOffSessions).toBe(40);
  });

  it('computes overall conversion over the whole funnel', () => {
    expect(report(sessions).overallConversion).toBe(0.04);
  });

  it('can be reconciled by hand at every step', () => {
    const result = report(sessions);
    // 100 → 60 → 30 → 10 → 4. Each step's out count is the next step's in count.
    for (let index = 1; index < result.transitions.length; index += 1) {
      expect(result.transitions[index]?.fromSessions).toBe(
        result.transitions[index - 1]?.toSessions,
      );
    }
  });
});

describe('largest drop-off', () => {
  it('picks the biggest share lost, not the biggest headcount', () => {
    // Layers: 100 → 50 → 50 → 40 → 2.
    // session → product_view loses 50 people, but only half the group.
    // checkout → purchase loses 38 people — fewer, yet 95% of its group.
    const sessions = [
      ...Array.from({ length: 50 }, () => session(['session'])),
      ...Array.from({ length: 10 }, () =>
        session(['session', 'product_view', 'add_to_cart']),
      ),
      ...Array.from({ length: 38 }, () =>
        session(['session', 'product_view', 'add_to_cart', 'checkout']),
      ),
      ...Array.from({ length: 2 }, () => session(ALL)),
    ];
    const result = report(sessions);

    expect(result.stages.map((row) => row.sessions)).toEqual([100, 50, 50, 40, 2]);
    expect(result.largestDropOff?.from).toBe('checkout');
    expect(result.largestDropOff?.dropOffSessions).toBe(38);
    expect(result.largestDropOff?.dropOffRate).toBeCloseTo(0.95, 10);

    // The earlier step lost more people but a smaller share, so it does not win.
    const firstStep = transitionFor(result.transitions, 'session');
    expect(firstStep.dropOffSessions).toBe(50);
    expect(firstStep.dropOffRate).toBeCloseTo(0.5, 10);
  });

  it('breaks a tie in favour of the earlier stage', () => {
    const transitions: FunnelTransition[] = [
      {
        from: 'session',
        to: 'product_view',
        label: 'a',
        fromSessions: 100,
        toSessions: 50,
        conversion: 0.5,
        dropOffRate: 0.5,
        dropOffSessions: 50,
        comparable: true,
      },
      {
        from: 'product_view',
        to: 'add_to_cart',
        label: 'b',
        fromSessions: 50,
        toSessions: 25,
        conversion: 0.5,
        dropOffRate: 0.5,
        dropOffSessions: 25,
        comparable: true,
      },
    ];
    expect(findLargestDropOff(transitions)?.from).toBe('session');
  });

  it('skips a step whose upper stage is empty rather than comparing it', () => {
    // Nobody views a product, so the steps below have no sessions to compare.
    const sessions = Array.from({ length: 10 }, () => session(['session']));
    const result = report(sessions);

    expect(result.largestDropOff?.from).toBe('session');
    expect(transitionFor(result.transitions, 'product_view').comparable).toBe(
      false,
    );
    expect(transitionFor(result.transitions, 'product_view').conversion).toBeNull();
  });

  it('returns null when no stage loses anyone', () => {
    const sessions = Array.from({ length: 5 }, () => session(ALL));
    const result = report(sessions);
    expect(result.largestDropOff).toBeNull();
    expect(result.overallConversion).toBe(1);
  });

  it('returns null for a completely empty funnel', () => {
    const result = report([]);
    expect(result.largestDropOff).toBeNull();
    expect(result.totalSessions).toBe(0);
    expect(result.overallConversion).toBeNull();
    for (const transition of result.transitions) {
      expect(transition.comparable).toBe(false);
      expect(transition.conversion).toBeNull();
      expect(transition.dropOffRate).toBeNull();
    }
  });
});

describe('invalid sequences', () => {
  it('excludes and reports a session that skips a stage', () => {
    const result = report([
      session(['session', 'product_view']),
      session(['session', 'add_to_cart']),
    ]);

    expect(result.totalSessions).toBe(1);
    expect(result.invalidSessions).toHaveLength(1);
    expect(result.invalidSessions[0]?.reason).toBe('out-of-order');
  });

  it('excludes and reports a session with a duplicated stage', () => {
    const result = report([session(['session', 'session'])]);
    expect(result.invalidSessions[0]?.reason).toBe('duplicate-stage');
    expect(result.totalSessions).toBe(0);
  });

  it('does not let an invalid session inflate any layer', () => {
    // An out-of-order session claims checkout. If it were silently truncated it
    // would still count towards sessions; it must not count anywhere.
    const result = report([
      session(['session', 'checkout', 'product_view']),
      session(['session']),
    ]);
    expect(result.stages.map((row) => row.sessions)).toEqual([1, 0, 0, 0, 0]);
  });
});

describe('date filtering', () => {
  it('includes both endpoints and excludes the days either side', () => {
    const result = report([
      session(['session'], { date: '2026-08-24' }),
      session(['session'], { date: '2026-08-25' }),
      session(['session'], { date: '2026-08-31' }),
      session(['session'], { date: '2026-09-01' }),
    ]);
    expect(result.totalSessions).toBe(2);
  });
});

describe('de-duplication', () => {
  it('counts a repeated session ID once per stage', () => {
    const duplicated = session(['session', 'product_view']);
    const result = report([duplicated, duplicated]);
    expect(result.stages[0]?.sessions).toBe(1);
    expect(result.stages[1]?.sessions).toBe(1);
  });

  it('counts sessions, not users — two sessions from one person count twice', () => {
    const result = report([
      session(['session'], { userId: 'usr_same' }),
      session(['session'], { userId: 'usr_same' }),
    ]);
    expect(result.totalSessions).toBe(2);
  });
});

describe('stage shares', () => {
  it('expresses each layer as a share of the first', () => {
    const sessions = [
      ...Array.from({ length: 75 }, () => session(['session'])),
      ...Array.from({ length: 25 }, () => session(['session', 'product_view'])),
    ];
    const result = report(sessions);
    expect(result.stages[0]?.shareOfSessions).toBe(1);
    expect(result.stages[1]?.shareOfSessions).toBe(0.25);
    expect(result.stages[4]?.shareOfSessions).toBe(0);
  });

  it('reports null shares when there are no sessions at all', () => {
    for (const row of report([]).stages) {
      expect(row.shareOfSessions).toBeNull();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { analyticsHref, auditHref, funnelHref, productHref } from '@/domain/agent/links';
import { makeRef, refId } from '@/domain/agent/refs';
import { parseChannelParam, parseEndParam, parseRangeParam, firstParam } from '@/domain/url-params';
import { buildWindow } from '@/domain/demo-window';

describe('evidence links', () => {
  it('builds analytics, funnel, product and audit links with their scope', () => {
    expect(analyticsHref(30)).toBe('/analytics?range=30');
    expect(funnelHref(30, null)).toBe('/funnel?range=30');
    expect(funnelHref(7, 'Organic Search')).toBe('/funnel?range=7&channel=Organic+Search');
    expect(productHref('prd_tent', 90)).toBe('/products/prd_tent?range=90');
    expect(auditHref('seo', 'snap_1')).toBe('/seo/snap_1');
    expect(auditHref('geo', 'snap 1')).toBe('/geo/snap%201');
  });

  it('adds an end date only when it differs from the demo end', () => {
    expect(analyticsHref(30, '2026-08-31')).toBe('/analytics?range=30');
    expect(analyticsHref(30, '2026-08-01')).toBe('/analytics?range=30&end=2026-08-01');
    expect(funnelHref(30, 'Email', '2026-08-01')).toBe('/funnel?range=30&channel=Email&end=2026-08-01');
    expect(productHref('prd_a', 30, 'Meta')).toBe('/products/prd_a?range=30&channel=Meta');
  });

  it('round-trips through the parsers the pages use', () => {
    const url = new URL(funnelHref(30, 'Paid Search'), 'http://localhost');
    expect(parseRangeParam(url.searchParams.get('range'), 90)).toBe(30);
    expect(parseChannelParam(url.searchParams.get('channel'))).toBe('Paid Search');
  });
});

describe('url params', () => {
  it('falls back on a missing or unsupported range', () => {
    expect(parseRangeParam(null, 90)).toBe(90);
    expect(parseRangeParam(undefined, 30)).toBe(30);
    expect(parseRangeParam('14', 90)).toBe(90);
    expect(parseRangeParam('abc', 90)).toBe(90);
    expect(parseRangeParam('7', 90)).toBe(7);
  });

  it('treats a missing or unknown channel as all channels', () => {
    expect(parseChannelParam(null)).toBeNull();
    expect(parseChannelParam(undefined)).toBeNull();
    expect(parseChannelParam('Organic search')).toBeNull();
    expect(parseChannelParam('Email')).toBe('Email');
  });

  it('takes only a single string value', () => {
    expect(firstParam('x')).toBe('x');
    expect(firstParam(['x', 'y'])).toBeNull();
    expect(firstParam(undefined)).toBeNull();
  });
});

describe('parseEndParam', () => {
  const coverage = buildWindow(90, '2026-08-31'); // 2026-06-03 .. 2026-08-31

  it('accepts an end whose whole window lies inside the data', () => {
    expect(parseEndParam('2026-08-01', 30, coverage)).toBe('2026-08-01');
    expect(parseEndParam('2026-08-31', 90, coverage)).toBe('2026-08-31');
  });

  it('accepts a window that starts exactly on the first covered day', () => {
    // 30 days ending 2026-07-02 starts on 2026-06-03.
    expect(parseEndParam('2026-07-02', 30, coverage)).toBe('2026-07-02');
  });

  it('falls back when the window would start one day before the data', () => {
    expect(parseEndParam('2026-07-01', 30, coverage)).toBe('2026-08-31');
  });

  it('falls back for an end after the data', () => {
    expect(parseEndParam('2026-09-01', 7, coverage)).toBe('2026-08-31');
  });

  it('accepts the last covered day itself', () => {
    expect(parseEndParam('2026-08-31', 7, coverage)).toBe('2026-08-31');
    expect(parseEndParam('2026-08-30', 7, coverage)).toBe('2026-08-30');
  });

  it('falls back for missing or malformed values', () => {
    expect(parseEndParam(null, 30, coverage)).toBe('2026-08-31');
    expect(parseEndParam(undefined, 30, coverage)).toBe('2026-08-31');
    expect(parseEndParam('2026-02-30', 30, coverage)).toBe('2026-08-31');
    expect(parseEndParam('yesterday', 30, coverage)).toBe('2026-08-31');
  });

  it('uses the demo window when no coverage is given', () => {
    expect(parseEndParam('2026-08-01', 30)).toBe('2026-08-01');
    expect(parseEndParam('2026-07-01', 30)).toBe('2026-08-31');
  });
});

describe('metric refs', () => {
  const window = buildWindow(30, '2026-08-31');

  it('gives the same id to the same figure in the same scope', () => {
    const scope = { tool: 'channels', window, channel: null, productId: null };
    expect(refId(scope, 'sessions')).toBe('channels:2026-08-02..2026-08-31:all:all:sessions');
    expect(refId(scope, 'sessions')).toBe(refId({ ...scope }, 'sessions'));
  });

  it('distinguishes channel, product and window', () => {
    const base = { tool: 'products', window, channel: null, productId: null };
    const ids = new Set([
      refId(base, 'x'),
      refId({ ...base, channel: 'Email' }, 'x'),
      refId({ ...base, productId: 'prd_a' }, 'x'),
      refId({ ...base, window: buildWindow(7, '2026-08-31') }, 'x'),
    ]);
    expect(ids.size).toBe(4);
  });

  it('carries the scope into the ref', () => {
    const ref = makeRef(
      { tool: 'funnel', window, channel: 'Meta', productId: null },
      'sessions',
      { label: 'Sessions', value: 12, unit: 'count', definition: 'sessions', href: '/funnel?range=30' },
    );
    expect(ref).toEqual({
      refId: 'funnel:2026-08-02..2026-08-31:Meta:all:sessions',
      label: 'Sessions',
      value: 12,
      unit: 'count',
      definition: 'sessions',
      href: '/funnel?range=30',
      window,
      channel: 'Meta',
      productId: null,
    });
  });
});

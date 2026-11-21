import { describe, expect, it } from 'vitest';
import { DEFAULT_SCOPE, mergeScope, sameScope, scopeWindow } from '@/domain/agent/scope';

describe('conversation scope', () => {
  it('starts at 30 days, all channels, all products', () => {
    expect(DEFAULT_SCOPE).toEqual({ range: 30, channel: null, products: [] });
    expect(scopeWindow(DEFAULT_SCOPE)).toEqual({ start: '2026-08-02', end: '2026-08-31', days: 30 });
  });

  it('changes only the channel on a channel follow-up, keeping the dates', () => {
    const next = mergeScope(DEFAULT_SCOPE, { channel: 'Organic Search' });
    expect(next).toEqual({ range: 30, channel: 'Organic Search', products: [] });
  });

  it('keeps the channel when only the range changes', () => {
    const organic = mergeScope(DEFAULT_SCOPE, { channel: 'Organic Search' });
    expect(mergeScope(organic, { range: 7 })).toEqual({ range: 7, channel: 'Organic Search', products: [] });
  });

  it('widens back to all channels on an explicit null, but not on an omitted channel', () => {
    const organic = mergeScope(DEFAULT_SCOPE, { channel: 'Organic Search' });
    expect(mergeScope(organic, { channel: null }).channel).toBeNull();
    expect(mergeScope(organic, {}).channel).toBe('Organic Search');
  });

  it('replaces products rather than appending, and copies them', () => {
    const products = ['NT-TENT-RDG2'];
    const narrowed = mergeScope(DEFAULT_SCOPE, { products });
    products.push('mutated');
    expect(narrowed.products).toEqual(['NT-TENT-RDG2']);
    expect(mergeScope(narrowed, { products: ['NT-BAG-SMT20'] }).products).toEqual(['NT-BAG-SMT20']);
    expect(mergeScope(narrowed, {}).products).toEqual(['NT-TENT-RDG2']);
  });

  it('compares scopes field by field', () => {
    expect(sameScope(DEFAULT_SCOPE, { range: 30, channel: null, products: [] })).toBe(true);
    expect(sameScope({ ...DEFAULT_SCOPE, products: ['a', 'b'] }, { ...DEFAULT_SCOPE, products: ['a', 'b'] })).toBe(true);
    expect(sameScope({ ...DEFAULT_SCOPE, products: ['a', 'b'] }, { ...DEFAULT_SCOPE, products: ['b', 'a'] })).toBe(false);
    expect(sameScope(DEFAULT_SCOPE, { ...DEFAULT_SCOPE, range: 7 })).toBe(false);
    expect(sameScope(DEFAULT_SCOPE, { ...DEFAULT_SCOPE, channel: 'Email' })).toBe(false);
    expect(sameScope({ ...DEFAULT_SCOPE, products: ['a'] }, { ...DEFAULT_SCOPE, products: ['b'] })).toBe(false);
    expect(sameScope({ ...DEFAULT_SCOPE, products: ['a'] }, { ...DEFAULT_SCOPE, products: ['a', 'b'] })).toBe(false);
  });
});

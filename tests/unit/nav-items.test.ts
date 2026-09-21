import { describe, expect, it } from 'vitest';
import {
  findNavItem,
  NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
} from '@/components/layout/nav-items';

/**
 * Navigation is the single source of truth for routes, labels and the
 * cross-module signposting on the dashboard and the about page. A route that
 * drifts out of this list stops being linked anywhere, which is exactly the
 * failure this guards against.
 */

const ALL = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS];

describe('navigation items', () => {
  it('lists the modules in the order an operator works through them', () => {
    // Order is the reading order, not the build order: the storefront chain
    // stays contiguous, Amazon sits as its own channel, and Recommendations is
    // last because it is where every other module converges.
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
      '/products',
      '/seo',
      '/geo',
      '/content',
      '/analytics',
      '/funnel',
      '/amazon',
      '/recommendations',
    ]);
  });

  it('records which dispatch built each module', () => {
    for (const item of NAV_ITEMS) {
      expect(item.dispatch, item.href).toMatch(/^Dispatch \d+$/);
    }
    expect(findNavItem('/recommendations')?.dispatch).toBe('Dispatch 8');
    expect(findNavItem('/amazon')?.dispatch).toBe('Dispatch 10');
  });

  it('has no duplicate routes or labels', () => {
    expect(new Set(ALL.map((item) => item.href)).size).toBe(ALL.length);
    expect(new Set(ALL.map((item) => item.label)).size).toBe(ALL.length);
  });

  it('gives every entry a question, a purpose and a label', () => {
    for (const item of ALL) {
      expect(item.question.length, `${item.href} question`).toBeGreaterThan(10);
      expect(item.purpose.length, `${item.href} purpose`).toBeGreaterThan(10);
      expect(item.label.trim(), `${item.href} label`).not.toBe('');
      // Signposting is a sentence the operator can act on, not a noun.
      expect(item.question.endsWith('?'), `${item.href} question`).toBe(true);
    }
  });

  it('marks every module as implemented now that the MVP is complete', () => {
    expect(ALL.every((item) => item.implemented)).toBe(true);
  });

  it('keeps About out of the analysis module list', () => {
    expect(NAV_ITEMS.some((item) => item.href === '/about-project')).toBe(false);
    expect(SECONDARY_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/about-project',
    ]);
  });

  it('resolves both primary and secondary routes', () => {
    expect(findNavItem('/funnel')?.label).toBe('Funnel');
    expect(findNavItem('/about-project')?.label).toBe('About this project');
    expect(findNavItem('/nope')).toBeUndefined();
  });

  it('uses absolute in-app paths', () => {
    for (const item of ALL) {
      expect(item.href.startsWith('/'), item.href).toBe(true);
      expect(item.href.endsWith('/'), item.href).toBe(false);
    }
  });
});

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
  it('covers every module dispatch from 1 to 8', () => {
    expect(NAV_ITEMS.map((item) => item.dispatch)).toEqual([
      'Dispatch 1',
      'Dispatch 2',
      'Dispatch 3',
      'Dispatch 4',
      'Dispatch 5',
      'Dispatch 6',
      'Dispatch 7',
      'Dispatch 8',
    ]);
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

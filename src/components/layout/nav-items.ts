import type { Route } from 'next';

/**
 * Single source of navigation truth: the sidebar, the placeholder pages and the
 * E2E navigation test all read this list, so a route cannot drift out of sync
 * with its label or its implementation status.
 */

export interface NavItem {
  href: Route;
  label: string;
  /** Short description shown on placeholder pages. */
  purpose: string;
  /** false renders a "not implemented yet" page and a sidebar hint. */
  implemented: boolean;
  dispatch: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    purpose: 'Headline traffic, revenue and conversion metrics for the demo window.',
    implemented: true,
    dispatch: 'Dispatch 1',
  },
  {
    href: '/products',
    label: 'Products',
    purpose:
      'Catalogue with search, filters and editable SEO metadata for each SKU.',
    implemented: true,
    dispatch: 'Dispatch 2',
  },
  {
    href: '/seo',
    label: 'SEO Audit',
    purpose:
      'Rule-based page audit covering metadata, headings, canonical, links and indexability.',
    implemented: true,
    dispatch: 'Dispatch 3',
  },
  {
    href: '/geo',
    label: 'GEO Audit',
    purpose:
      'Internal heuristic for how readable a page is to generative search systems.',
    implemented: true,
    dispatch: 'Dispatch 4',
  },
  {
    href: '/content',
    label: 'Content',
    purpose:
      'Content plan driven by keyword, search intent, funnel stage and target product.',
    implemented: true,
    dispatch: 'Dispatch 5',
  },
  {
    href: '/analytics',
    label: 'Analytics',
    purpose:
      'Channel performance: sessions, users, revenue, orders, CAC and ROAS.',
    implemented: true,
    dispatch: 'Dispatch 6',
  },
  {
    href: '/funnel',
    label: 'Funnel',
    purpose:
      'Session-level conversion funnel with stage drop-off and the largest loss point.',
    implemented: true,
    dispatch: 'Dispatch 7',
  },
  {
    href: '/recommendations',
    label: 'Recommendations',
    purpose:
      'Prioritised actions aggregated from every rule engine, with evidence.',
    implemented: true,
    dispatch: 'Dispatch 8',
  },
];

export function findNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}

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
  /**
   * Which sales line the module reports on. The two share this catalogue and
   * nothing else, so saying which is which is the single most useful thing to
   * put next to a module name.
   */
  channel: 'Storefront' | 'Amazon' | 'Both';
  /** The operator's question this module answers, for cross-module signposting. */
  question: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    purpose: 'Headline traffic, revenue and conversion metrics for the demo window.',
    channel: 'Both',
    question:
      'Is the business healthy this window, and where should I look first?',
  },
  {
    href: '/products',
    label: 'Products',
    purpose:
      'Catalogue with search, filters and editable SEO metadata for each SKU.',
    channel: 'Both',
    question:
      'Which SKUs exist, and is each one\'s on-page metadata fit to publish?',
  },
  {
    href: '/seo',
    label: 'SEO Audit',
    purpose:
      'Rule-based page audit covering metadata, headings, canonical, links and indexability.',
    channel: 'Storefront',
    question:
      'Is this page technically fit for classic search?',
  },
  {
    href: '/geo',
    label: 'GEO Audit',
    purpose:
      'Internal heuristic for how readable a page is to generative search systems.',
    channel: 'Storefront',
    question:
      'Can a generative engine extract a trustworthy answer from this page?',
  },
  {
    href: '/content',
    label: 'Content',
    purpose:
      'Content plan driven by keyword, search intent, funnel stage and target product.',
    channel: 'Storefront',
    question:
      'What should we write next, and why that rather than something else?',
  },
  {
    href: '/analytics',
    label: 'Analytics',
    purpose:
      'Channel performance: sessions, users, revenue, orders, CAC and ROAS.',
    channel: 'Storefront',
    question:
      'Where does traffic come from, and what does each channel cost and return?',
  },
  {
    href: '/funnel',
    label: 'Funnel',
    purpose:
      'Session-level conversion funnel with stage drop-off and the largest loss point.',
    channel: 'Storefront',
    question:
      'Where in the journey are sessions lost?',
  },
  {
    href: '/amazon',
    label: 'Amazon',
    purpose:
      'Marketplace listing quality: title, bullets, images, backend terms, variations and buy box.',
    channel: 'Amazon',
    question:
      'Are our Amazon listings fit to sell, and which one is worst?',
  },
  {
    href: '/amazon/advertising',
    label: 'Amazon Ads',
    purpose:
      'Search term performance, campaign efficiency, and which terms to harvest or negate.',
    channel: 'Amazon',
    question:
      'Which search terms are worth bidding on, and which are burning money?',
  },
  {
    href: '/recommendations',
    label: 'Recommendations',
    purpose:
      'Prioritised actions aggregated from every rule engine, with evidence.',
    channel: 'Both',
    question:
      'Given everything above, what should I do on Monday morning?',
  },
];

/**
 * Routes that are not analysis modules. Kept separate so the module list stays
 * the list of things that read data, and so cross-module signposting on the
 * dashboard does not offer "About" as somewhere to continue an analysis.
 */
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/about-project',
    label: 'About this project',
    purpose:
      'Why the project exists, how the modules fit together, and what the model cannot do.',
    channel: 'Both',
    question: 'What am I looking at, and how far should I trust it?',
  },
];

/**
 * The nav entry a path belongs to, preferring the most specific match.
 *
 * Without this, `/amazon/advertising` matches both the `/amazon` entry (by
 * prefix) and its own entry (exactly), and the sidebar marks two links as the
 * current page. Longest matching href wins.
 */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS]) {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

export function findNavItem(href: string): NavItem | undefined {
  return [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].find(
    (item) => item.href === href,
  );
}

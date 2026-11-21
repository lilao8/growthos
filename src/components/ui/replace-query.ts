/**
 * Keeps the address bar in step with a page's own filters.
 *
 * Uses `history.replaceState`, which Next.js integrates with its router, so
 * the URL can be copied as evidence of exactly what the page is showing.
 * Other parameters — including the `demo` QA seam — are left untouched.
 */
export function replaceQuery(updates: Record<string, string | null>): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

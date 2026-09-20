export function SeoDisclaimer({ ruleVersion }: { ruleVersion: string }) {
  return (
    <p
      className="text-xs text-[var(--color-ink-muted)]"
      data-testid="seo-disclaimer"
    >
      This score comes from {ruleVersion}, a set of rules defined inside this
      project. It is not any search engine&apos;s ranking algorithm and does not
      predict rankings or traffic. Audits read a stored page snapshot, not a live
      crawl of the site.
    </p>
  );
}

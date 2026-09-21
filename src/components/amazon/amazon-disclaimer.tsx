import { AMAZON_DISCLAIMER } from '@/domain/amazon/config';

/**
 * Shown wherever a listing score appears. Same reasoning as the SEO and GEO
 * disclaimers: a number with no stated limits gets quoted as a fact, and this
 * one sits next to a second channel whose metrics must never be added to the
 * storefront's.
 */
export function AmazonDisclaimer() {
  return (
    <p
      className="text-xs leading-relaxed text-[var(--color-ink-muted)]"
      data-testid="amazon-disclaimer"
    >
      {AMAZON_DISCLAIMER}
    </p>
  );
}

/**
 * The separation rule, stated on screen rather than only in the code. It is the
 * single most important thing about having two channels in one workbench.
 */
export function ChannelSeparationNote() {
  return (
    <p
      className="text-xs leading-relaxed text-[var(--color-ink-muted)]"
      data-testid="channel-separation-note"
    >
      Amazon and the storefront share this catalogue but not their numbers. An
      Amazon session and a storefront session are counted differently and are
      never added together anywhere in this project, so nothing on this page
      contributes to the Dashboard, Analytics or Funnel totals.
    </p>
  );
}

import { GEO_DISCLAIMER } from '@/domain/geo-audit/config';

/**
 * The GEO disclaimer is not fine print. The model is an internal heuristic and
 * says nothing about whether an AI system will cite a page, so that is stated
 * prominently wherever a GEO score appears.
 */
export function GeoDisclaimer({ ruleVersion }: { ruleVersion: string }) {
  return (
    <div
      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3"
      data-testid="geo-disclaimer"
    >
      <p className="text-sm font-medium">{GEO_DISCLAIMER}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-[var(--color-ink-muted)]">
        <li>
          Rule set {ruleVersion}, designed inside this project. It is not
          Google&apos;s, OpenAI&apos;s or any other company&apos;s algorithm.
        </li>
        <li>
          A high score does not make citation likely, and nothing here measures
          whether an AI system actually quotes the page. No AI API is called.
        </li>
        <li>
          Originality is only checked as a stated claim plus supporting material
          — it cannot be verified. A cited source is not necessarily a reliable
          one, and matching words is not understanding meaning.
        </li>
      </ul>
    </div>
  );
}

/**
 * GEO audit configuration.
 *
 * GEO here means Generative Engine Optimization: how ready a page's content is
 * to be understood and quoted by a generative search system.
 *
 * What this model is, stated plainly because it is easy to oversell:
 *
 * - It is an internal heuristic designed in this project. It is not Google's,
 *   OpenAI's or anyone else's algorithm, and no company publishes one.
 * - It measures observable properties of captured content — whether a direct
 *   answer exists, whether facts are structured, whether sources are cited.
 *   It cannot measure whether any AI system will actually cite the page.
 * - A high score does not make citation likely. It means the content is
 *   structured so that a machine could extract a claim and attribute it.
 *
 * Three limits are inherent to the approach and are surfaced in the UI:
 * originality can only be checked as a *claim plus supporting material*, never
 * verified; the presence of a source says nothing about its reliability; and
 * matching words is not understanding meaning.
 */

export const GEO_RULE_VERSION = 'geo-1.0.0';

/** Every rule scores one of these three bands. */
export const GEO_POINTS = { full: 10, partial: 5, none: 0 } as const;
export const GEO_MAX_POINTS_PER_RULE = GEO_POINTS.full;

export interface GeoAuditConfig {
  /** A direct answer shorter than this reads as a fragment, not an answer. */
  directAnswerMinChars: number;
  /** FAQ pairs needed for full marks. */
  faqPairsForFull: number;
  /** Structured spec facts needed for full marks. */
  factsForFull: number;
  factsForPartial: number;
  /** Section headings needed for a well-structured page. */
  sectionHeadingsForFull: number;
  /** Body length below which a page is treated as having no real content. */
  bodyMinChars: number;
  /** Extractability signals needed for full marks. */
  extractableSignalsForFull: number;
  /** Words that signal a claim without a number behind it. */
  vagueMarketingTerms: readonly string[];
}

export const DEFAULT_GEO_CONFIG: GeoAuditConfig = {
  directAnswerMinChars: 40,
  faqPairsForFull: 2,
  factsForFull: 4,
  factsForPartial: 1,
  sectionHeadingsForFull: 2,
  bodyMinChars: 60,
  extractableSignalsForFull: 3,
  vagueMarketingTerms: [
    'best',
    'amazing',
    'incredible',
    'perfect',
    'ultimate',
    'revolutionary',
    'world-class',
    'unbeatable',
    'nothing else comes close',
    'you will love',
  ],
};

export const GEO_RULE_IDS = [
  'topic-clarity',
  'direct-answer',
  'faq-coverage',
  'heading-structure',
  'factual-density',
  'entity-clarity',
  'structured-product-facts',
  'source-evidence',
  'original-information',
  'extractability',
] as const;

export type GeoRuleId = (typeof GEO_RULE_IDS)[number];

export interface GeoRuleMeta {
  id: GeoRuleId;
  title: string;
  /** The observable proxy signal this rule reads. No fuzzy "AI judgement". */
  signal: string;
  rationale: string;
}

export const GEO_RULE_META: Record<GeoRuleId, GeoRuleMeta> = {
  'topic-clarity': {
    id: 'topic-clarity',
    title: 'Topic clarity',
    signal: 'H1 present, and its wording overlaps the meta title.',
    rationale:
      'A generative system has to decide what a page is about before it can quote it. A page whose heading and title disagree gives it two answers.',
  },
  'direct-answer': {
    id: 'direct-answer',
    title: 'Direct answer availability',
    signal:
      'An explicit direct-answer sentence, long enough to stand alone and containing a concrete figure.',
    rationale:
      'A sentence that answers the page’s core question outright is the unit a generative system can lift and attribute.',
  },
  'faq-coverage': {
    id: 'faq-coverage',
    title: 'FAQ coverage',
    signal: 'Question and answer pairs with non-empty answers.',
    rationale:
      'Explicit questions map onto the way people actually ask, and each answer is already scoped to one question.',
  },
  'heading-structure': {
    id: 'heading-structure',
    title: 'Heading structure',
    signal:
      'Exactly one H1, at least two section headings, and no skipped levels.',
    rationale:
      'Heading levels are how a machine segments a page into topics. Skipped levels break that segmentation.',
  },
  'factual-density': {
    id: 'factual-density',
    title: 'Factual density',
    signal: 'Labelled specification facts with values.',
    rationale:
      'Concrete, labelled facts are quotable. Adjectives are not.',
  },
  'entity-clarity': {
    id: 'entity-clarity',
    title: 'Entity clarity',
    signal:
      'The brand name appears in the title or content, and a product identifier is present.',
    rationale:
      'Attribution needs a named entity. Content that never names its brand can be quoted without credit.',
  },
  'structured-product-facts': {
    id: 'structured-product-facts',
    title: 'Structured product facts',
    signal:
      'Product markup carrying name, price, currency, availability and SKU.',
    rationale:
      'Machine-readable product facts remove the need to infer price or stock from prose.',
  },
  'source-evidence': {
    id: 'source-evidence',
    title: 'Source and evidence',
    signal: 'Cited sources, ideally with a resolvable URL.',
    rationale:
      'A claim with a source can be checked. Note that a source being present says nothing about whether it is reliable.',
  },
  'original-information': {
    id: 'original-information',
    title: 'Original information',
    signal:
      'A stated originality claim, backed by evidence or first-hand measurements.',
    rationale:
      'Content that adds something not available elsewhere is worth citing. This check can only see whether a claim and supporting material exist — it cannot verify that the work is genuinely original.',
  },
  extractability: {
    id: 'extractability',
    title: 'Extractability',
    signal:
      'How many liftable structures the page offers: a direct answer, a fact table, an FAQ, section headings.',
    rationale:
      'The easier it is to lift a self-contained claim, the less a system has to paraphrase prose it may get wrong.',
  },
};

/**
 * A readable band for the score. This describes how ready the *content* is,
 * not how likely an AI system is to cite it — nothing here can measure that.
 */
export const READINESS_BANDS = [
  { min: 80, label: 'Strong', note: 'Structured, factual and attributable.' },
  { min: 55, label: 'Moderate', note: 'Usable, with clear gaps to close.' },
  { min: 30, label: 'Weak', note: 'Little that a machine could lift and attribute.' },
  { min: 0, label: 'Poor', note: 'Largely unstructured marketing copy.' },
] as const;

export function readinessBand(score: number | null): {
  label: string;
  note: string;
} {
  if (score === null) {
    return {
      label: 'Not assessed',
      note: 'Nothing on this page could be evaluated.',
    };
  }
  const band = READINESS_BANDS.find((entry) => score >= entry.min);
  return band === undefined
    ? { label: 'Not assessed', note: '' }
    : { label: band.label, note: band.note };
}

export const GEO_DISCLAIMER =
  'This score is an internal heuristic designed to evaluate content readiness for generative search systems.';

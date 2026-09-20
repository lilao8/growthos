import type { AuditCheck, PageSnapshot, Severity } from '../types';
import {
  GEO_POINTS,
  GEO_RULE_META,
  type GeoAuditConfig,
  type GeoRuleId,
} from './config';

/**
 * The ten GEO rules.
 *
 * Each rule reads an observable property of the captured snapshot and awards
 * 10, 5 or 0 points. No rule asks a model for an opinion, and no rule claims to
 * know what an AI system will do with the page.
 *
 * Scoring bands, applied consistently:
 * - 10 / `pass`    the signal is fully present
 * - 5  / `warning` partially present — something is there, but thin
 * - 0  / `error`   the page does not provide it at all
 * - `unknown`      the input was never captured, so the rule cannot be
 *                  evaluated. Excluded from the score; lowers coverage.
 *
 * The difference between 0 and unknown matters: "this page has no FAQ" is a
 * finding, "we never captured whether it has one" is a gap in the data.
 */

export interface GeoRuleInput {
  snapshot: PageSnapshot;
  /** The demo brand name, used by the entity rule. */
  brand: string;
  config: GeoAuditConfig;
}

type GeoRuleFn = (input: GeoRuleInput) => AuditCheck;

function award(
  ruleId: GeoRuleId,
  points: number,
  message: string,
  recommendation: string,
  evidence: string | null,
): AuditCheck {
  const status =
    points >= GEO_POINTS.full
      ? 'pass'
      : points > GEO_POINTS.none
        ? 'warning'
        : 'error';
  const severity: Severity =
    points >= GEO_POINTS.full ? 'info' : points > GEO_POINTS.none ? 'low' : 'medium';

  return {
    ruleId,
    status,
    severity,
    message,
    explanation: `${GEO_RULE_META[ruleId].signal} ${GEO_RULE_META[ruleId].rationale}`,
    recommendation,
    evidence,
    points,
  };
}

function notAssessed(
  ruleId: GeoRuleId,
  message: string,
  recommendation: string,
): AuditCheck {
  return {
    ruleId,
    status: 'unknown',
    severity: 'info',
    message,
    explanation: `${GEO_RULE_META[ruleId].signal} ${GEO_RULE_META[ruleId].rationale}`,
    recommendation,
    evidence: null,
    points: null,
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function significantWords(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

/** Share of `needle`'s significant words that appear in `haystack`, 0–1. */
function wordOverlap(needle: string, haystack: string): number {
  const words = significantWords(needle);
  if (words.length === 0) return 0;
  const target = normalize(haystack);
  return words.filter((word) => target.includes(word)).length / words.length;
}

function hasConcreteFigure(value: string): boolean {
  return /\d/.test(value);
}

/** Everything a reader sees, used where "the page says X" is the question. */
function pageText(snapshot: PageSnapshot): string {
  return [
    snapshot.bodyText,
    ...snapshot.headings.map((heading) => heading.text),
    ...snapshot.faq.flatMap((entry) => [entry.question, entry.answer]),
    ...snapshot.facts.flatMap((fact) => [fact.label, fact.value]),
  ].join(' ');
}

function bodyIsCaptured(snapshot: PageSnapshot, config: GeoAuditConfig): boolean {
  return snapshot.bodyText.trim().length >= config.bodyMinChars;
}

const topicClarity: GeoRuleFn = ({ snapshot }) => {
  const h1 = snapshot.h1?.trim() ?? '';
  const title = snapshot.metaTitle?.trim() ?? '';

  if (h1 === '' && title === '' && snapshot.headings.length === 0) {
    return notAssessed(
      'topic-clarity',
      'Neither a heading nor a title was captured, so the page topic cannot be assessed.',
      'Capture the page heading and title in the snapshot.',
    );
  }

  if (h1 === '') {
    return award(
      'topic-clarity',
      GEO_POINTS.none,
      'The page has no H1, so nothing states its subject outright.',
      'Add a single H1 naming the product, matching the title.',
      `h1: absent; title: ${title === '' ? 'absent' : title}`,
    );
  }

  if (title === '') {
    return award(
      'topic-clarity',
      GEO_POINTS.partial,
      'The page has an H1 but no title to corroborate it.',
      'Add a meta title consistent with the H1.',
      `h1: ${h1}; title: absent`,
    );
  }

  const overlap = wordOverlap(h1, title);
  const evidence = `h1: "${h1}"; title: "${title}"; word overlap ${Math.round(overlap * 100)}%`;

  if (overlap >= 0.5) {
    return award(
      'topic-clarity',
      GEO_POINTS.full,
      'The H1 and the title describe the same subject.',
      'No action needed.',
      evidence,
    );
  }
  return award(
    'topic-clarity',
    GEO_POINTS.partial,
    'The H1 and the title describe the subject differently.',
    'Align the two so the page states one subject, not two.',
    evidence,
  );
};

const directAnswer: GeoRuleFn = ({ snapshot, config }) => {
  const answer = snapshot.directAnswer?.trim() ?? '';
  if (answer === '') {
    return award(
      'direct-answer',
      GEO_POINTS.none,
      'The page offers no direct answer sentence.',
      'Add one sentence that answers the page’s core question outright, with a figure in it.',
      'directAnswer: absent',
    );
  }

  const longEnough = answer.length >= config.directAnswerMinChars;
  const concrete = hasConcreteFigure(answer);
  const evidence = `"${answer}" (${answer.length} characters, ${concrete ? 'contains' : 'no'} figure)`;

  if (longEnough && concrete) {
    return award(
      'direct-answer',
      GEO_POINTS.full,
      'The page states a self-contained answer with a concrete figure.',
      'No action needed.',
      evidence,
    );
  }
  return award(
    'direct-answer',
    GEO_POINTS.partial,
    longEnough
      ? 'The direct answer has no concrete figure in it.'
      : 'The direct answer is too short to stand on its own.',
    'Rewrite it as a full sentence containing the number a reader is after.',
    evidence,
  );
};

const faqCoverage: GeoRuleFn = ({ snapshot, config }) => {
  const usable = snapshot.faq.filter(
    (entry) => entry.question.trim() !== '' && entry.answer.trim() !== '',
  );
  const evidence = `${usable.length} usable Q&A pair(s) of ${snapshot.faq.length} captured`;

  if (usable.length >= config.faqPairsForFull) {
    return award(
      'faq-coverage',
      GEO_POINTS.full,
      `The page answers ${usable.length} explicit questions.`,
      'No action needed.',
      evidence,
    );
  }
  if (usable.length > 0) {
    return award(
      'faq-coverage',
      GEO_POINTS.partial,
      'The page answers only one explicit question.',
      `Add at least ${config.faqPairsForFull} questions shoppers actually ask.`,
      evidence,
    );
  }
  return award(
    'faq-coverage',
    GEO_POINTS.none,
    'The page has no FAQ.',
    'Add the questions support or reviews keep raising, each with a short answer.',
    evidence,
  );
};

const headingStructure: GeoRuleFn = ({ snapshot, config }) => {
  const headings = snapshot.headings;
  if (headings.length === 0) {
    return award(
      'heading-structure',
      GEO_POINTS.none,
      'The page has no headings at all, so it cannot be segmented into topics.',
      'Add an H1 and section headings for each part of the page.',
      'headings: none',
    );
  }

  const h1Count = headings.filter((heading) => heading.level === 1).length;
  const sections = headings.filter((heading) => heading.level === 2).length;

  let skipsLevel = false;
  let previous = 0;
  for (const heading of headings) {
    if (previous !== 0 && heading.level > previous + 1) skipsLevel = true;
    previous = heading.level;
  }

  const problems = [
    h1Count === 1 ? null : `${h1Count} H1 heading(s)`,
    sections >= config.sectionHeadingsForFull
      ? null
      : `${sections} section heading(s)`,
    skipsLevel ? 'skipped heading level' : null,
  ].filter((problem): problem is string => problem !== null);

  const evidence = `${headings.length} heading(s): ${h1Count} H1, ${sections} H2`;

  if (problems.length === 0) {
    return award(
      'heading-structure',
      GEO_POINTS.full,
      'One H1, clear sections and no skipped levels.',
      'No action needed.',
      evidence,
    );
  }
  return award(
    'heading-structure',
    GEO_POINTS.partial,
    `The heading structure is incomplete: ${problems.join(', ')}.`,
    'Use one H1 and an H2 per section, without skipping levels.',
    evidence,
  );
};

const factualDensity: GeoRuleFn = ({ snapshot, config }) => {
  const usable = snapshot.facts.filter(
    (fact) => fact.label.trim() !== '' && fact.value.trim() !== '',
  );
  const withFigures = usable.filter((fact) => hasConcreteFigure(fact.value));
  const evidence =
    usable.length === 0
      ? 'facts: none'
      : usable.map((fact) => `${fact.label}: ${fact.value}`).join('; ');

  if (usable.length >= config.factsForFull) {
    return award(
      'factual-density',
      GEO_POINTS.full,
      `The page states ${usable.length} labelled facts, ${withFigures.length} of them numeric.`,
      'No action needed.',
      evidence,
    );
  }
  if (usable.length >= config.factsForPartial) {
    return award(
      'factual-density',
      GEO_POINTS.partial,
      `The page states only ${usable.length} labelled fact(s).`,
      `List at least ${config.factsForFull} specifications with values.`,
      evidence,
    );
  }
  return award(
    'factual-density',
    GEO_POINTS.none,
    'The page states no labelled facts.',
    'Add a specification table: weight, dimensions, materials, ratings.',
    evidence,
  );
};

const entityClarity: GeoRuleFn = ({ snapshot, brand }) => {
  const title = normalize(snapshot.metaTitle ?? '');
  const content = normalize(pageText(snapshot));
  const brandKey = normalize(brand);
  const brandWord = significantWords(brand)[0] ?? brandKey;

  const inTitle = title.includes(brandKey) || title.includes(brandWord);
  const inContent = content.includes(brandKey) || content.includes(brandWord);

  const hasIdentifier = snapshot.structuredData.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>)['sku'] === 'string',
  );

  const evidence = `brand in title: ${inTitle}; brand in content: ${inContent}; product identifier: ${hasIdentifier}`;

  if (inTitle && hasIdentifier) {
    return award(
      'entity-clarity',
      GEO_POINTS.full,
      'The page names its brand in the title and carries a product identifier.',
      'No action needed.',
      evidence,
    );
  }
  if (inTitle || inContent) {
    return award(
      'entity-clarity',
      GEO_POINTS.partial,
      hasIdentifier
        ? 'The brand is named but not in the title.'
        : 'The brand is named, but the page carries no product identifier.',
      'Name the brand in the title and publish the SKU in structured data.',
      evidence,
    );
  }
  return award(
    'entity-clarity',
    GEO_POINTS.none,
    'The page never names the brand it belongs to.',
    'Name the brand in the title and in the content, so a quote can be attributed.',
    evidence,
  );
};

function readProductEntry(entry: unknown): Record<string, unknown> | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  return record['@type'] === 'Product' ? record : null;
}

const structuredProductFacts: GeoRuleFn = ({ snapshot }) => {
  const product = snapshot.structuredData
    .map(readProductEntry)
    .find((entry): entry is Record<string, unknown> => entry !== null);

  if (product === undefined) {
    return award(
      'structured-product-facts',
      GEO_POINTS.none,
      'The page publishes no Product markup.',
      'Add Product structured data with name, price, currency, availability and SKU.',
      snapshot.structuredData.length === 0
        ? 'structuredData: none'
        : `${snapshot.structuredData.length} block(s), none of type Product`,
    );
  }

  const offers = product['offers'];
  const offerRecord =
    typeof offers === 'object' && offers !== null
      ? (offers as Record<string, unknown>)
      : {};

  const present = {
    name: typeof product['name'] === 'string',
    sku: typeof product['sku'] === 'string',
    price: typeof offerRecord['price'] === 'string',
    priceCurrency: typeof offerRecord['priceCurrency'] === 'string',
    availability: typeof offerRecord['availability'] === 'string',
  };
  const missing = Object.entries(present)
    .filter(([, found]) => !found)
    .map(([field]) => field);
  const evidence =
    missing.length === 0
      ? 'name, sku, price, priceCurrency, availability all present'
      : `missing: ${missing.join(', ')}`;

  if (missing.length === 0) {
    return award(
      'structured-product-facts',
      GEO_POINTS.full,
      'Product markup carries the full set of machine-readable facts.',
      'No action needed.',
      evidence,
    );
  }
  return award(
    'structured-product-facts',
    GEO_POINTS.partial,
    `Product markup is present but omits ${missing.join(', ')}.`,
    'Complete the markup so price and stock need not be inferred from prose.',
    evidence,
  );
};

const sourceEvidence: GeoRuleFn = ({ snapshot }) => {
  const usable = snapshot.evidence.filter((item) => item.label.trim() !== '');
  const withUrl = usable.filter(
    (item) => item.url !== null && item.url.trim() !== '',
  );
  const evidence =
    usable.length === 0
      ? 'evidence: none'
      : usable
          .map((item) => `${item.label}${item.url === null ? ' (no URL)' : ` → ${item.url}`}`)
          .join('; ');

  if (withUrl.length > 0) {
    return award(
      'source-evidence',
      GEO_POINTS.full,
      `The page cites ${withUrl.length} source(s) with a resolvable link.`,
      'No action needed. Note that citing a source says nothing about whether it is reliable.',
      evidence,
    );
  }
  if (usable.length > 0) {
    return award(
      'source-evidence',
      GEO_POINTS.partial,
      'The page names a source but gives no link to it.',
      'Link the source so the claim can be checked.',
      evidence,
    );
  }
  return award(
    'source-evidence',
    GEO_POINTS.none,
    'The page cites no sources.',
    'Cite the test, standard or measurement behind the claims on the page.',
    evidence,
  );
};

const originalInformation: GeoRuleFn = ({ snapshot }) => {
  const claim = snapshot.originalityClaim?.trim() ?? '';
  const supportingEvidence = snapshot.evidence.length > 0;
  const supportingFacts = snapshot.facts.length >= 3;
  const evidence = `originality claim: ${claim === '' ? 'absent' : `"${claim}"`}; supporting evidence entries: ${snapshot.evidence.length}; facts: ${snapshot.facts.length}`;

  if (claim === '') {
    return award(
      'original-information',
      GEO_POINTS.none,
      'The page claims no original material of its own.',
      'State what this page adds that is not available elsewhere — a measurement, a test, a comparison you ran.',
      evidence,
    );
  }
  if (supportingEvidence || supportingFacts) {
    return award(
      'original-information',
      GEO_POINTS.full,
      'The page states original material and backs it with evidence or measurements.',
      'No action needed. This check sees the claim and its supporting material; it cannot verify that the work is genuinely original.',
      evidence,
    );
  }
  return award(
    'original-information',
    GEO_POINTS.partial,
    'The page claims original material but shows nothing to support it.',
    'Publish the measurements or sources behind the claim.',
    evidence,
  );
};

const extractability: GeoRuleFn = ({ snapshot, config }) => {
  if (!bodyIsCaptured(snapshot, config) && snapshot.headings.length === 0) {
    return notAssessed(
      'extractability',
      'No page body was captured, so there is nothing to assess for extractability.',
      'Capture the page content in the snapshot.',
    );
  }

  const signals = [
    snapshot.directAnswer !== null && snapshot.directAnswer.trim() !== ''
      ? 'direct answer'
      : null,
    snapshot.facts.length >= config.factsForPartial ? 'fact table' : null,
    snapshot.faq.length > 0 ? 'FAQ' : null,
    snapshot.headings.filter((heading) => heading.level === 2).length >=
    config.sectionHeadingsForFull
      ? 'section headings'
      : null,
  ].filter((signal): signal is string => signal !== null);

  const vague = config.vagueMarketingTerms.filter((term) =>
    normalize(snapshot.bodyText).includes(term),
  );

  const evidence = `${signals.length} liftable structure(s): ${
    signals.length === 0 ? 'none' : signals.join(', ')
  }${vague.length > 0 ? `; vague wording: ${vague.join(', ')}` : ''}`;

  if (signals.length >= config.extractableSignalsForFull && vague.length === 0) {
    return award(
      'extractability',
      GEO_POINTS.full,
      'The page offers several self-contained structures a system can lift.',
      'No action needed.',
      evidence,
    );
  }
  if (signals.length > 0) {
    return award(
      'extractability',
      GEO_POINTS.partial,
      vague.length > 0
        ? `The page has some structure but leans on unquantified claims (${vague.join(', ')}).`
        : `The page offers only ${signals.length} liftable structure(s).`,
      'Replace superlatives with figures, and add a direct answer, a fact table or an FAQ.',
      evidence,
    );
  }
  return award(
    'extractability',
    GEO_POINTS.none,
    'The page is prose with nothing a system could lift as a standalone claim.',
    'Add a direct answer, a specification table and an FAQ.',
    evidence,
  );
};

/** Rules run in this order, which is the order the UI lists them. */
export const GEO_RULES: readonly GeoRuleFn[] = [
  topicClarity,
  directAnswer,
  faqCoverage,
  headingStructure,
  factualDensity,
  entityClarity,
  structuredProductFacts,
  sourceEvidence,
  originalInformation,
  extractability,
];

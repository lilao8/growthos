import { z } from 'zod';
import { DEMO_RANGE_DAYS } from '@/domain/demo-window';
import { CHANNELS } from '@/domain/types';
import type { ConversationScope } from '@/domain/agent/scope';
import { REPLAY_FILES } from '@/fixtures/agent-replays';
import type { AgentTurnResult } from './orchestrator';

/**
 * Recorded runs of the agent, read back for the replay pages.
 *
 * A replay is frozen: the question, the scope it was asked in, the calls the
 * model actually made, the rendered answer with its figures and links, the
 * raw figures it cites, the rule versions and the token use. Showing one
 * never calls a model or a tool. Files are checked against this schema when
 * read, so a malformed recording fails loudly rather than rendering wrong.
 */

/**
 * A link that stays on this site: a root-relative path that the browser
 * resolves to the page's own origin. "//host/path" and "/\\host" are
 * protocol-relative tricks that leave the site, so they are refused.
 */
export function isSiteLink(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return false;
  try {
    return new URL(href, 'https://growthos.invalid').origin === 'https://growthos.invalid';
  } catch {
    return false;
  }
}

const siteHref = z.string().refine(isSiteLink, { message: 'Links must stay on this site.' });

/**
 * Things that must never be written to a replay: anything key-shaped, an
 * account identifier, or an auth header. Returns what was found, by kind only.
 */
export function findSensitive(text: string): string[] {
  const found: string[] = [];
  if (/\bsk-[A-Za-z0-9_-]{6,}/.test(text)) found.push('api-key');
  if (/\borg-[A-Za-z0-9]{6,}/.test(text)) found.push('organisation-id');
  if (/\bBearer\s+[A-Za-z0-9]/.test(text) || /Authorization/i.test(text)) found.push('auth-header');
  return found;
}

const segment = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string() }),
  z.strictObject({ kind: z.literal('link'), text: z.string(), href: siteHref, title: z.string() }),
]);
const scope = z.strictObject({ range: z.literal(DEMO_RANGE_DAYS), channel: z.enum(CHANNELS).nullable(), products: z.array(z.string()) });
const window = z.strictObject({ start: z.string(), end: z.string(), days: z.number() });
const findingScope = z.strictObject({ channel: z.string().nullable(), productId: z.string().nullable() });
const priority = z.enum(['Critical', 'High', 'Medium', 'Low']);

const renderedFinding = z.strictObject({
  rank: z.number(),
  basedOn: z.string(),
  title: z.string(),
  facts: z.array(z.array(segment)),
  whyPriority: z.array(segment),
  howToVerify: z.array(segment),
  ruleGuidance: z.string(),
  scope: findingScope,
  priority,
  effectivePriority: priority,
  downgraded: z.boolean(),
  strength: z.enum(['sufficient', 'limited', 'insufficient']),
  affectedSessions: z.number().nullable(),
  sampleLabel: z.string(),
  lostSessions: z.number().nullable(),
  evidence: z.array(z.strictObject({ label: z.string(), href: siteHref })),
});

const renderedAnswer = z.strictObject({
  summary: z.array(segment),
  facts: z.array(z.array(segment)),
  findings: z.array(renderedFinding),
  gaps: z.array(z.array(segment)),
  source: z.enum(['model', 'fallback']),
  citedRefIds: z.array(z.string()),
});

/**
 * What a recorded tool call may carry as input: the parsed arguments (short
 * text, numbers, booleans, short lists) or, when the model sent invalid JSON,
 * the raw text — bounded either way. Anything else is not a recording.
 */
const toolInput = z.union([
  z.string().max(2000),
  z.record(
    z.string().max(40),
    z.union([z.string().max(200), z.number(), z.boolean(), z.null(), z.array(z.string().max(200)).max(20)]),
  ),
]);

const window2 = z.strictObject({ start: z.string(), end: z.string() });
const citableRef = z.strictObject({
  refId: z.string().max(300),
  label: z.string().max(300),
  value: z.number().nullable(),
  unit: z.enum(['count', 'ratio', 'cents', 'multiple']),
  channel: z.string().nullable(),
  productId: z.string().nullable(),
  window: window2,
  funnel: z.boolean(),
  href: siteHref,
});
const citableComparison = z.strictObject({
  currentRefId: z.string().max(300),
  previousRefId: z.string().max(300).nullable(),
  current: z.number().nullable(),
  previous: z.number().nullable(),
  relativeChange: z.number().nullable(),
  direction: z.enum(['up', 'down', 'flat', 'unknown']),
  supportsConclusion: z.boolean(),
});
const citableAudit = z.strictObject({
  refId: z.string().max(300),
  ruleId: z.string().max(80),
  status: z.string().max(20),
  evidence: z.string().max(1000).nullable(),
  productId: z.string().nullable(),
  pageLabel: z.string().max(300),
  href: siteHref,
});

const turnResult = z.strictObject({
  status: z.enum(['answered', 'fallback', 'failed']),
  answer: renderedAnswer.nullable(),
  scope,
  window,
  toolCalls: z.array(z.strictObject({ id: z.string().max(100), name: z.string().max(64), input: toolInput, status: z.string().max(40), summary: z.string().max(2000) })),
  toolGaps: z.array(z.strictObject({ message: z.string(), links: z.array(z.strictObject({ label: z.string(), href: siteHref })) })),
  toolNotes: z.array(z.string()),
  refusedActions: z.array(z.string()),
  noActionTaken: z.boolean(),
  failedChecks: z.array(z.strictObject({ name: z.string(), message: z.string() })),
  citations: z.strictObject({ refs: z.array(citableRef), comparisons: z.array(citableComparison), audits: z.array(citableAudit) }),
  provenance: z.strictObject({ dataSources: z.array(z.string()), ruleVersions: z.array(z.string()) }),
  usage: z.strictObject({ promptTokens: z.number(), completionTokens: z.number(), requests: z.number(), largestPromptTokens: z.number() }).nullable(),
  validation: z.array(z.strictObject({ issueCodes: z.array(z.string()) })),
  issues: z.array(z.strictObject({ finding: z.number().nullable(), code: z.string(), message: z.string() })),
  notes: z.array(z.string()),
  model: z.string(),
  message: z.string().nullable(),
});

export const replayFileSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  /** live-model: a real model answered. scripted: the stand-in, for tests and demos. */
  source: z.enum(['live-model', 'scripted']),
  model: z.string(),
  recordedAt: z.string(),
  demoAsOf: z.string(),
  /** Recordings run on the seed catalogue, never on a visitor's own edits. */
  stateSource: z.literal('seed'),
  turns: z.array(z.strictObject({ question: z.string(), scopeBefore: scope, result: turnResult })).min(1),
});

export interface ReplayTurn {
  question: string;
  scopeBefore: ConversationScope;
  result: AgentTurnResult;
}

export interface Replay {
  version: 1;
  id: string;
  title: string;
  source: 'live-model' | 'scripted';
  model: string;
  recordedAt: string;
  demoAsOf: string;
  stateSource: 'seed';
  turns: ReplayTurn[];
}

export type ReplayParse = { ok: true; replay: Replay } | { ok: false; error: string };

export function parseReplay(raw: unknown): ReplayParse {
  const sensitive = findSensitive(JSON.stringify(raw) ?? '');
  if (sensitive.length > 0) return { ok: false, error: `Replay contains sensitive content (${sensitive.join(', ')}).` };
  const parsed = replayFileSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Replay does not match the format${first === undefined ? '' : ` (${first.path.join('.')}: ${first.message})`}.` };
  }
  // The schema mirrors AgentTurnResult; citations are frozen tool records kept as recorded.
  return { ok: true, replay: parsed.data as unknown as Replay };
}

export type ReplayList = { replays: Replay[]; invalid: Array<{ index: number; error: string }> };

/** Every bundled replay, newest first. A malformed file is reported, not shown. */
export function listReplays(files: readonly unknown[] = REPLAY_FILES): ReplayList {
  const replays: Replay[] = [];
  const invalid: ReplayList['invalid'] = [];
  files.forEach((file, index) => {
    const parsed = parseReplay(file);
    if (parsed.ok) replays.push(parsed.replay);
    else invalid.push({ index, error: parsed.error });
  });
  replays.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0));
  return { replays, invalid };
}

export function findReplay(id: string, files: readonly unknown[] = REPLAY_FILES): Replay | null {
  return listReplays(files).replays.find((replay) => replay.id === id) ?? null;
}

/**
 * A turn passed on the first attempt only if it was answered and the model's
 * single submitted answer had no issues. No submission at all (`[]`), a first
 * answer refused and never repaired (`[["code"]]`), a repair, a fallback or a
 * failure are all something else.
 */
export function passedFirstTime(result: Pick<AgentTurnResult, 'status' | 'validation'>): boolean {
  return result.status === 'answered' && result.validation.length === 1 && result.validation[0]?.issueCodes.length === 0;
}

export interface ReplaySummary {
  turns: number;
  firstPass: number;
  /** Responses from the model that reported token usage — not HTTP attempts, which include retries. */
  responsesWithUsage: number;
  promptTokens: number;
  completionTokens: number;
  largestPromptTokens: number;
  provenance: string[];
}

export function summarizeReplay(replay: Replay): ReplaySummary {
  let responsesWithUsage = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let largestPromptTokens = 0;
  for (const turn of replay.turns) {
    const usage = turn.result.usage;
    if (usage === null) continue;
    responsesWithUsage += usage.requests;
    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
    largestPromptTokens = Math.max(largestPromptTokens, usage.largestPromptTokens);
  }
  return {
    turns: replay.turns.length,
    firstPass: replay.turns.filter((turn) => passedFirstTime(turn.result)).length,
    responsesWithUsage,
    promptTokens,
    completionTokens,
    largestPromptTokens,
    provenance: [...new Set(replay.turns.flatMap((turn) => [...turn.result.provenance.dataSources, ...turn.result.provenance.ruleVersions]))].sort(),
  };
}

/**
 * Only what the turn view renders crosses to the browser. The raw citations,
 * provenance, usage and validation messages stay on the server; the page
 * shows their summary instead.
 */
export type PublicTurnResult = Pick<
  AgentTurnResult,
  'status' | 'answer' | 'scope' | 'window' | 'toolCalls' | 'toolGaps' | 'toolNotes' | 'refusedActions' | 'noActionTaken' | 'failedChecks' | 'notes' | 'model' | 'message'
>;

export function publicTurn(result: AgentTurnResult): PublicTurnResult {
  return {
    status: result.status,
    answer: result.answer,
    scope: result.scope,
    window: result.window,
    toolCalls: result.toolCalls.map((call) => ({ id: call.id, name: call.name, input: call.input, status: call.status, summary: call.summary })),
    toolGaps: result.toolGaps,
    toolNotes: result.toolNotes,
    refusedActions: result.refusedActions,
    noActionTaken: result.noActionTaken,
    failedChecks: result.failedChecks,
    notes: result.notes,
    model: result.model,
    message: result.message,
  };
}

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

const segment = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string() }),
  z.strictObject({ kind: z.literal('link'), text: z.string(), href: z.string().startsWith('/'), title: z.string() }),
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
  evidence: z.array(z.strictObject({ label: z.string(), href: z.string().startsWith('/') })),
});

const renderedAnswer = z.strictObject({
  summary: z.array(segment),
  facts: z.array(z.array(segment)),
  findings: z.array(renderedFinding),
  gaps: z.array(z.array(segment)),
  source: z.enum(['model', 'fallback']),
  citedRefIds: z.array(z.string()),
});

const turnResult = z.object({
  status: z.enum(['answered', 'fallback', 'failed']),
  answer: renderedAnswer.nullable(),
  scope,
  window,
  toolCalls: z.array(z.strictObject({ id: z.string(), name: z.string(), input: z.unknown(), status: z.string(), summary: z.string() })),
  toolGaps: z.array(z.strictObject({ message: z.string(), links: z.array(z.strictObject({ label: z.string(), href: z.string() })) })),
  refusedActions: z.array(z.string()),
  noActionTaken: z.boolean(),
  failedChecks: z.array(z.strictObject({ name: z.string(), message: z.string() })),
  citations: z.strictObject({ refs: z.array(z.unknown()), comparisons: z.array(z.unknown()), audits: z.array(z.unknown()) }),
  provenance: z.strictObject({ dataSources: z.array(z.string()), ruleVersions: z.array(z.string()) }),
  usage: z.strictObject({ promptTokens: z.number(), completionTokens: z.number() }).nullable(),
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

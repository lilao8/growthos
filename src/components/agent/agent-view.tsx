'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/status-block';
import type { RenderedFinding } from '@/domain/agent/answer-render';
import { DEFAULT_SCOPE, scopeWindow, type ConversationScope } from '@/domain/agent/scope';
import { formatDateRange, formatInteger } from '@/domain/format';
import type { DemoState } from '@/repositories/types';
import { askAgent } from '@/services/agent/client';
import type { AgentEvent, AgentTurnResult, ToolCallRecord } from '@/services/agent/orchestrator';
import { resolveStateRepository, type DemoDataMode } from '@/services/demo-data-source';
import { AnswerText, plainText } from './answer-text';

/** The analysis agent: ask, watch it query, read a ranked answer with links to every figure. */

const EXAMPLES = [
  '过去 30 天，独立站最该优先排查什么？',
  'What should we look into first over the last 30 days?',
];
const FOLLOW_UP_EXAMPLE = '只看自然搜索呢？';

const TOOL_LABELS: Record<string, string> = {
  get_channel_performance: 'Checking channel performance',
  get_funnel: 'Walking the conversion funnel',
  get_product_performance: 'Looking up product performance',
  get_audit_findings: 'Reading SEO and GEO audit findings',
  set_analysis_scope: 'Updating the analysis scope',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Requested "${name}"`;
}

function describeScope(scope: ConversationScope): string {
  const window = scopeWindow(scope);
  const channel = scope.channel ?? 'All channels';
  const products = scope.products.length === 0 ? 'All products' : scope.products.join(', ');
  return `${formatDateRange(window.start, window.end)} · ${scope.range} days · UTC · ${channel} · ${products}`;
}

export interface Turn {
  question: string;
  /** The fields the view renders; a replay passes only these. */
  result: Pick<
    AgentTurnResult,
    'status' | 'answer' | 'scope' | 'window' | 'toolCalls' | 'toolGaps' | 'toolNotes' | 'refusedActions' | 'noActionTaken' | 'failedChecks' | 'notes' | 'model' | 'message'
  >;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; question: string; events: AgentEvent[] }
  | { kind: 'error'; question: string; message: string }
  | { kind: 'disabled'; message: string };

export function AgentView({ mode }: { mode: DemoDataMode | null }) {
  const repository = useMemo(() => resolveStateRepository(mode), [mode]);
  const [localState, setLocalState] = useState<
    { kind: 'loading' } | { kind: 'ready'; state: DemoState } | { kind: 'error'; message: string }
  >({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [scope, setScope] = useState<ConversationScope>(DEFAULT_SCOPE);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [draft, setDraft] = useState('');
  // The request in flight, so leaving the page cancels it on the server too.
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    void repository
      .load()
      .then((result) => {
        if (cancelled) return;
        setLocalState(
          result.status === 'corrupted'
            ? { kind: 'error', message: result.error ?? 'Your saved demo data could not be read.' }
            : { kind: 'ready', state: result.state },
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLocalState({ kind: 'error', message: cause instanceof Error ? cause.message : 'Could not read your demo data.' });
      });
    return () => {
      cancelled = true;
    };
  }, [repository, attempt]);

  const ask = useCallback(
    async (question: string) => {
      if (localState.kind !== 'ready' || question.trim() === '') return;
      setStatus({ kind: 'running', question, events: [] });
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const outcome = await askAgent(
        {
          question,
          history: turns.map((turn) => ({
            question: turn.question,
            answerSummary: turn.result.answer === null ? (turn.result.message ?? '') : plainText(turn.result.answer.summary),
          })),
          scope,
          state: localState.state,
        },
        (event) => {
          setStatus((current) =>
            current.kind === 'running' ? { ...current, events: [...current.events, event] } : current,
          );
          if (event.type === 'scope') setScope(event.scope);
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      inFlight.current = null;
      if (outcome.kind === 'done' && outcome.result.status === 'failed') {
        // Nothing usable came back: keep the question and offer a retry.
        setStatus({ kind: 'error', question, message: outcome.result.message ?? 'The analysis could not produce an answer.' });
      } else if (outcome.kind === 'done') {
        setScope(outcome.result.scope);
        setTurns((current) => [...current, { question, result: outcome.result }]);
        setStatus({ kind: 'idle' });
        setDraft('');
      } else if (outcome.kind === 'disabled') {
        setStatus({ kind: 'disabled', message: outcome.message });
      } else {
        // The question stays in the box so a retry needs no retyping.
        setStatus({ kind: 'error', question, message: outcome.message });
      }
    },
    [localState, scope, turns],
  );

  const newConversation = (): void => {
    setTurns([]);
    setScope(DEFAULT_SCOPE);
    setStatus({ kind: 'idle' });
    setDraft('');
  };

  if (localState.kind === 'loading') return <LoadingBlock label="Reading your demo data." />;
  if (localState.kind === 'error') {
    return (
      <ErrorBlock
        title="Could not read your demo data"
        message={`${localState.message} You can reset the demo data on the About page.`}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  const running = status.kind === 'running';
  const examples = turns.length === 0 ? EXAMPLES : [FOLLOW_UP_EXAMPLE];

  return (
    <div className="flex flex-col gap-6" data-testid="agent-ready">
      <Card>
        <CardHeader
          title="Analysis scope"
          description="Every answer is computed for this scope. A follow-up keeps it unless you change it; a new conversation starts again from the last 30 days."
        >
          <Badge tone="muted">Demo data</Badge>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm tabular-nums" data-testid="agent-scope">
            {describeScope(scope)}
          </p>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={newConversation}
              disabled={running}
              data-testid="agent-new-conversation"
              className="rounded-md border border-[var(--color-line-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
            >
              New conversation
            </button>
          )}
        </CardBody>
      </Card>

      {turns.map((turn, index) => (
        <TurnView key={index} turn={turn} index={index} />
      ))}

      {status.kind === 'running' && <Progress question={status.question} events={status.events} />}

      {status.kind === 'disabled' && (
        <Card testId="agent-live-disabled">
          <CardBody>
            <p className="text-sm font-medium">{status.message}</p>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Live questions run only on a local build with the agent enabled. This deployment never calls a model.
            </p>
            <p className="mt-2 text-sm">
              <Link href="/agent/replays" className="underline underline-offset-2" data-testid="agent-replays-link">
                See recorded runs instead
              </Link>
            </p>
          </CardBody>
        </Card>
      )}

      {status.kind === 'error' && (
        <ErrorBlock
          title="The analysis did not finish"
          message={status.message}
          onRetry={() => void ask(status.question)}
        />
      )}

      <Card>
        <CardBody className="flex flex-col gap-3">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <label htmlFor="agent-question" className="text-sm font-medium">
              {turns.length === 0 ? 'Ask about the storefront' : 'Ask a follow-up'}
            </label>
            <textarea
              id="agent-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={500}
              disabled={running}
              data-testid="agent-question"
              className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={running || draft.trim() === ''}
                data-testid="agent-ask"
                className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
              >
                {running ? 'Analysing…' : 'Ask'}
              </button>
              {examples.map((example, index) => (
                <button
                  key={example}
                  type="button"
                  disabled={running}
                  onClick={() => {
                    setDraft(example);
                    void ask(example);
                  }}
                  data-testid={`agent-example-${index}`}
                  className="rounded-md border border-[var(--color-line-strong)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
                >
                  {example}
                </button>
              ))}
            </div>
          </form>
          <p className="text-xs text-[var(--color-ink-muted)]">
            The agent reads demo data only and cannot change anything. It says where to look and how to check; whether to act is your decision.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Progress({ question, events }: { question: string; events: readonly AgentEvent[] }) {
  const lines = events.flatMap((event): string[] => {
    if (event.type === 'tool-start') return [`${toolLabel(event.name)}…`];
    if (event.type === 'tool-end') return [`${toolLabel(event.record.name)}: ${event.record.summary}`];
    if (event.type === 'scope') return [`Scope is now ${describeScope(event.scope)}`];
    if (event.type === 'answering') return ['Writing the answer…'];
    if (event.type === 'repairing') return ['The answer failed a check; asking for one correction…'];
    return [];
  });
  return (
    <Card testId="agent-progress">
      <CardHeader title="Analysing" description={question} />
      <CardBody>
        <ol role="status" aria-live="polite" className="flex flex-col gap-1 text-sm">
          {lines.length === 0 ? <li>Starting…</li> : lines.map((line, index) => <li key={index}>{line}</li>)}
        </ol>
      </CardBody>
    </Card>
  );
}

/** Findings ranked apart in a channel conversation: page audits count sessions from every channel. */
function separateHeading(findings: readonly RenderedFinding[], channel: string | null): string {
  return findings.every((finding) => finding.scope.channel === null) ? 'Site-wide page audits' : `Outside the ${channel ?? 'channel'} ranking`;
}

function separateNote(findings: readonly RenderedFinding[], channel: string | null): string {
  const name = channel ?? 'channel';
  const other = findings.some((finding) => finding.scope.channel !== null) ? ' or from another channel' : '';
  return `Ranked separately from the ${name} findings above: their sessions come from all channels${other}, so they are not compared with ${name} traffic.`;
}

function FindingCard({ finding }: { finding: RenderedFinding }) {
  return (
    <Card testId="agent-finding">
      <CardHeader title={`${finding.rank}. ${finding.title}`}>
        <Badge tone={finding.effectivePriority === 'Critical' ? 'accent' : 'neutral'}>{finding.effectivePriority}</Badge>
      </CardHeader>
      <CardBody className="flex flex-col gap-2 text-sm">
        <div>
          <p className="font-medium">Observed</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5" data-testid="agent-facts">
            {finding.facts.map((fact, factIndex) => (
              <li key={factIndex} data-testid="agent-fact">
                <AnswerText segments={fact} />
              </li>
            ))}
          </ul>
        </div>
        <p>
          <span className="font-medium">Why first: </span>
          <AnswerText segments={finding.whyPriority} />
        </p>
        <p>
          <span className="font-medium">How to verify: </span>
          <AnswerText segments={finding.howToVerify} />
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]" data-testid="agent-rule-guidance">
          Rule guidance: {finding.ruleGuidance}
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]" data-testid="agent-finding-sample">
          Scope: {finding.scope.channel ?? 'All channels'}
          {finding.scope.productId === null ? '' : ` · product ${finding.scope.productId}`} · Evidence {finding.strength}
          {finding.affectedSessions === null
            ? ''
            : finding.affectedSessions === 0
              ? ' · no sessions in this window, so the current impact is limited'
              : ` · ${formatInteger(finding.affectedSessions)} ${finding.sampleLabel}`}
          {finding.lostSessions === null ? '' : ` · ${formatInteger(finding.lostSessions)} lost at this step`}
          {finding.downgraded ? ' · moved down one level because the sample is limited' : ''}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Evidence links">
          {finding.evidence.map((link) => (
            <li key={link.href}>
              <Link href={link.href as Route} className="underline underline-offset-2" data-testid="agent-evidence-link">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function TurnView({ turn, index }: { turn: Turn; index: number }) {
  const { result } = turn;
  const scripted = result.model.startsWith('scripted:');
  return (
    <section aria-labelledby={`turn-${index}`} className="flex flex-col gap-4" data-testid="agent-turn">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`turn-${index}`} className="text-base font-semibold">
          {turn.question}
        </h2>
        <p className="text-xs text-[var(--color-ink-muted)]" data-testid="agent-turn-scope">
          {describeScope(result.scope)} · {scripted ? 'Scripted stand-in model' : result.model}
        </p>
      </div>

      {result.status === 'failed' || result.answer === null ? (
        <Card testId="agent-failed">
          <CardBody>
            <p className="text-sm">{result.message ?? 'No answer could be produced.'}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {result.status === 'fallback' && (
            <p role="status" className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm" data-testid="agent-fallback">
              {result.message} GrowthOS ranked the tool findings below directly.
            </p>
          )}
          {result.noActionTaken && (
            <p role="status" className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm font-medium" data-testid="agent-refused">
              No action was taken.{' '}
              {result.refusedActions.length > 0
                ? `${result.refusedActions.join(', ')} is not available: this agent can only read and analyse.`
                : 'This agent has no tool that changes anything, so nothing was changed.'}
            </p>
          )}
          {result.failedChecks.length > 0 && (
            <Card testId="agent-failed-checks">
              <CardHeader title="Could not check" description="These lookups failed. A failure is not the same as no data; retry to fill them in." />
              <CardBody>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {result.failedChecks.map((check, checkIndex) => (
                    <li key={checkIndex}>
                      {toolLabel(check.name)}: {check.message}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <p className="text-sm" data-testid="agent-summary">
            <AnswerText segments={result.answer.summary} />
          </p>
          {result.toolNotes.length > 0 && (
            <ul className="text-xs text-[var(--color-ink-muted)]" aria-label="How the lookup was matched" data-testid="agent-tool-notes">
              {result.toolNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {result.answer.facts.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" aria-label="Figures found" data-testid="agent-answer-facts">
              {result.answer.facts.map((fact, factIndex) => (
                <li key={factIndex} data-testid="agent-answer-fact">
                  <AnswerText segments={fact} />
                </li>
              ))}
            </ul>
          )}
          {result.answer.findings.length > 0 && (
            <ol className="flex flex-col gap-3" aria-label={result.answer.rankingChannel === null ? 'Ranked findings' : `Ranked ${result.answer.rankingChannel} findings`}>
              {result.answer.findings.map((finding) => (
                <li key={finding.basedOn}>
                  <FindingCard finding={finding} />
                </li>
              ))}
            </ol>
          )}
          {result.answer.separateFindings.length > 0 && (
            <section aria-labelledby={`turn-${index}-separate`} className="flex flex-col gap-3" data-testid="agent-separate-findings">
              <div>
                <h3 id={`turn-${index}-separate`} className="text-sm font-semibold">
                  {separateHeading(result.answer.separateFindings, result.answer.rankingChannel)}
                </h3>
                <p className="text-xs text-[var(--color-ink-muted)]">{separateNote(result.answer.separateFindings, result.answer.rankingChannel)}</p>
              </div>
              <ol className="flex flex-col gap-3">
                {result.answer.separateFindings.map((finding) => (
                  <li key={finding.basedOn}>
                    <FindingCard finding={finding} />
                  </li>
                ))}
              </ol>
            </section>
          )}
          {(result.answer.gaps.length > 0 || result.toolGaps.length > 0) && (
            <Card testId="agent-gaps">
              <CardHeader title="What is missing" description="Data the tools could not supply, or samples too small to conclude from." />
              <CardBody>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {result.answer.gaps.map((gap, gapIndex) => (
                    <li key={`model-${gapIndex}`}>
                      <AnswerText segments={gap} />
                    </li>
                  ))}
                  {result.toolGaps.map((gap) => (
                    <li key={gap.message} data-testid="agent-tool-gap">
                      {gap.message}
                      {gap.links.map((link) => (
                        <span key={link.href}>
                          {' '}
                          <Link href={link.href as Route} className="text-xs underline underline-offset-2">
                            {link.label}
                          </Link>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {result.notes.length > 0 && (
        <ul className="text-xs text-[var(--color-ink-muted)]" data-testid="agent-notes">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm" data-testid="agent-tool-log">
        <summary className="cursor-pointer font-medium">Tool calls ({result.toolCalls.length})</summary>
        <ol className="mt-2 flex flex-col gap-2">
          {result.toolCalls.map((call: ToolCallRecord) => (
            <li key={call.id} data-testid="agent-tool-call" data-tool={call.name} data-status={call.status}>
              <p>
                <span className="font-mono text-xs">{call.name}</span> · {call.status} · {call.summary}
              </p>
              <pre className="mt-1 overflow-x-auto rounded bg-[var(--color-surface-muted)] p-2 text-xs">{JSON.stringify(call.input)}</pre>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

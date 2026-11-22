import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TurnView } from '@/components/agent/agent-view';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { findReplay, listReplays, publicTurn, summarizeReplay } from '@/services/agent/replays';

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return listReplays().replays.map((replay) => ({ id: replay.id }));
}

/** One recorded run, rendered from its frozen result. No model, no tools. */
export default async function ReplayPage({ params }: ReplayPageProps) {
  const { id } = await params;
  const replay = findReplay(id);
  if (replay === null) notFound();

  const live = replay.source === 'live-model';
  const summary = summarizeReplay(replay);

  return (
    <>
      <PageHeader title={replay.title} description={`A recorded run, replayed from what was saved on ${replay.recordedAt.slice(0, 10)}. Nothing on this page calls a model.`} />
      <div className="flex flex-col gap-6" data-testid="replay-ready">
        <Card testId="replay-source">
          <CardHeader
            title={live ? 'Real model run' : 'Scripted stand-in run'}
            description={
              live
                ? `Answered by ${replay.model} on the seed demo catalogue (data ending ${replay.demoAsOf}). Figures were computed by GrowthOS tools and checked before display.`
                : `Answered by the scripted stand-in (${replay.model}) used in tests and demos. It is not a language model.`
            }
          >
            <Badge tone={live ? 'accent' : 'muted'}>{live ? 'Real model' : 'Scripted'}</Badge>
          </CardHeader>
          <CardBody className="flex flex-col gap-1 text-xs text-[var(--color-ink-muted)]">
            <p>
              Links open today&apos;s pages. Traffic figures come from the same fixed demo data, so they match. Audit pages reflect your own
              browser&apos;s edits, which may differ from the seed catalogue this run used; the verdicts shown here are the recorded ones.
            </p>
            {live && (
              <p data-testid="replay-usage">
                Tokens: {summary.promptTokens.toLocaleString('en-US')} in, {summary.completionTokens.toLocaleString('en-US')} out, across{' '}
                {summary.responsesWithUsage} model responses that reported usage (largest single prompt{' '}
                {summary.largestPromptTokens.toLocaleString('en-US')}). Retried requests are not counted separately.
              </p>
            )}
            <p data-testid="replay-validation">
              Answer checks: {summary.firstPass} of {summary.turns} turns were answered on the first attempt
              {summary.firstPass < summary.turns
                ? `; ${summary.turns - summary.firstPass} needed a correction, fell back to GrowthOS's own ranking or failed`
                : ''}
              .
            </p>
            <p data-testid="replay-provenance">Sources and rules: {summary.provenance.join(' · ')}</p>
          </CardBody>
        </Card>

        {replay.turns.map((turn, index) => (
          <TurnView key={index} turn={{ question: turn.question, result: publicTurn(turn.result) }} index={index} />
        ))}

        <Link href="/agent/replays" className="text-sm underline underline-offset-2">
          All recorded runs
        </Link>
      </div>
    </>
  );
}

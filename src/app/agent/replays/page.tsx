import Link from 'next/link';
import type { Route } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyBlock } from '@/components/ui/status-block';
import { PageHeader } from '@/components/ui/page-header';
import { listReplays } from '@/services/agent/replays';

/** Recorded agent runs. Static: browsing them never calls a model. */
export default function ReplaysPage() {
  const { replays, invalid } = listReplays();
  return (
    <>
      <PageHeader
        title="Ops Agent replays"
        description="Recorded conversations with the agent, frozen as they ran: the questions, the tools it called, the figures it cited and its answer. Viewing them calls no model."
      />
      <div className="flex flex-col gap-4" data-testid="replays-ready">
        {replays.length === 0 ? (
          <EmptyBlock title="No recorded runs yet" description="Replays appear here once a run has been recorded with npm run agent:record." />
        ) : (
          replays.map((replay) => (
            <Card key={replay.id} testId="replay-card">
              <CardHeader title={replay.title} description={`Recorded ${replay.recordedAt.slice(0, 10)} · ${replay.model} · demo data ending ${replay.demoAsOf}`}>
                <Badge tone={replay.source === 'live-model' ? 'accent' : 'muted'}>
                  {replay.source === 'live-model' ? 'Real model run' : 'Scripted stand-in'}
                </Badge>
              </CardHeader>
              <CardBody className="flex flex-col gap-2 text-sm">
                <ol className="list-decimal pl-5">
                  {replay.turns.map((turn, index) => (
                    <li key={index}>{turn.question}</li>
                  ))}
                </ol>
                <Link href={`/agent/replays/${replay.id}` as Route} className="underline underline-offset-2" data-testid={`replay-link-${replay.id}`}>
                  Open this replay
                </Link>
              </CardBody>
            </Card>
          ))
        )}
        {invalid.length > 0 && (
          <p className="text-xs text-[var(--color-ink-muted)]" data-testid="replays-invalid">
            {invalid.length} recorded file{invalid.length === 1 ? '' : 's'} could not be read and {invalid.length === 1 ? 'is' : 'are'} not shown.
          </p>
        )}
      </div>
    </>
  );
}

import { AgentView } from '@/components/agent/agent-view';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface AgentPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgentPage({ searchParams }: AgentPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="Ops Agent"
        description="Ask what to look into first. The agent queries the read-only tools, and every figure in its answer links to the page that shows it."
      />
      <AgentView mode={mode} />
    </>
  );
}

import { AboutView } from '@/components/about/about-view';
import { DemoReset } from '@/components/demo/demo-reset';
import { PageHeader } from '@/components/ui/page-header';
import { parseDemoDataMode } from '@/services/demo-data-source';

interface AboutPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AboutProjectPage({
  searchParams,
}: AboutPageProps) {
  const params = await searchParams;
  const raw = params['demo'];
  const mode = parseDemoDataMode(typeof raw === 'string' ? raw : null);

  return (
    <>
      <PageHeader
        title="About this project"
        description="What GrowthOS is, which operating problem it models, how the modules connect, and where the model stops."
      />
      <AboutView />
      <DemoReset mode={mode} />
    </>
  );
}

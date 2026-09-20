import { notFound } from 'next/navigation';
import { ModulePlaceholder } from '@/components/module-placeholder';
import { findNavItem } from '@/components/layout/nav-items';

export default function Page() {
  const item = findNavItem('/seo');
  if (item === undefined) notFound();
  return <ModulePlaceholder item={item} />;
}

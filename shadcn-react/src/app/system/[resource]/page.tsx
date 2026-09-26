import { ManagementPage } from '@/features/system/components/management-page';
import { isResourceKind } from '@/features/system/config';
import { notFound } from 'next/navigation';

export default async function SystemResourcePage({
  params
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource } = await params;
  if (!isResourceKind(resource)) notFound();
  return <ManagementPage resource={resource} />;
}

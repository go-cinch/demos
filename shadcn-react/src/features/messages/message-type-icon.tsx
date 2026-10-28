import { Icons } from '@/components/icons';
export default function MessageTypeIcon({
  type,
  label
}: {
  type: 'notice' | 'system';
  label: string;
}) {
  const Icon = type === 'notice' ? Icons.notification : Icons.info;
  return (
    <span
      role='img'
      aria-label={label}
      className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
    >
      <Icon className='size-5' aria-hidden='true' />
    </span>
  );
}

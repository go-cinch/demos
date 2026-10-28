import AuditPage from '@/features/audit/audit-page';
import { Suspense } from 'react';
export default function Page() {
  return (
    <Suspense>
      <AuditPage kind='operation' />
    </Suspense>
  );
}

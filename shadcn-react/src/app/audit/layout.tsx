import { ProtectedLayout } from '@/components/layout/protected-layout';
export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}

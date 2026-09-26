import { ProtectedLayout } from '@/components/layout/protected-layout';

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}

import { ProtectedLayout } from '@/components/layout/protected-layout';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}

import type { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sign-up-view';

export const metadata: Metadata = {
  title: 'Authentication | Register',
  description: 'Registration page for authentication.'
};

export default function RegisterRoute() {
  return <SignUpViewPage />;
}

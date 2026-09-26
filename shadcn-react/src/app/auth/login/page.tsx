import type { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: 'Authentication | Login',
  description: 'Login page for authentication.'
};

export default function LoginRoute() {
  return <SignInViewPage />;
}

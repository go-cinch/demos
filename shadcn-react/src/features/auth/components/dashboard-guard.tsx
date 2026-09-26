'use client';

import { resolveHomePath, useAuth } from '@/features/auth/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useLocale } from '@/features/i18n/locale-context';

export function DashboardGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { pick } = useLocale();
  React.useEffect(() => {
    if (auth.loading) return;
    if (auth.passwordResetRequired) router.replace('/auth/reset-password');
    else if (!auth.user) router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
    else if (pathname === '/dashboard/workspace' && !auth.user.permission.menus.includes('*'))
      router.replace(resolveHomePath(auth.user));
  }, [auth.loading, auth.passwordResetRequired, auth.user, pathname, router]);
  if (auth.loading || !auth.user || auth.passwordResetRequired)
    return (
      <div className='flex min-h-screen items-center justify-center text-sm text-muted-foreground'>
        {pick('Loading session…', '正在加载会话…')}
      </div>
    );
  return children;
}

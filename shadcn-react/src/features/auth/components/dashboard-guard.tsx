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
    else if (
      pathname === '/dashboard/workspace' &&
      !auth.user.permission.menus.includes('/dashboard/workspace')
    )
      router.replace(resolveHomePath(auth.user));
  }, [auth.loading, auth.passwordResetRequired, auth.user, pathname, router]);
  if (auth.loading || !auth.user || auth.passwordResetRequired)
    return (
      <div className='flex min-h-screen items-center justify-center text-sm text-muted-foreground'>
        {pick('Loading session…', '正在加载会话…')}
      </div>
    );
  const allowed =
    ['/dashboard/overview', '/profile'].includes(pathname) ||
    auth.user.permission.menus.includes(pathname);
  if (!allowed)
    return (
      <div
        role='status'
        className='flex min-h-screen items-center justify-center text-muted-foreground'
      >
        {pick('You do not have access to this page.', '你没有访问此页面的权限。')}
      </div>
    );
  return children;
}

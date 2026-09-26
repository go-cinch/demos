'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useLocale } from '@/features/i18n/locale-context';

type BreadcrumbItem = {
  title: string;
  link: string;
};

// This allows to add custom title as well
const routeMapping: Record<string, BreadcrumbItem[]> = {
  '/dashboard': [{ title: 'Dashboard', link: '/dashboard' }],
  '/dashboard/employee': [
    { title: 'Dashboard', link: '/dashboard' },
    { title: 'Employee', link: '/dashboard/employee' }
  ],
  '/dashboard/product': [
    { title: 'Dashboard', link: '/dashboard' },
    { title: 'Product', link: '/dashboard/product' }
  ]
  // Add more custom mappings as needed
};

export function useBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useLocale();

  const breadcrumbs = useMemo(() => {
    // Check if we have a custom mapping for this exact path
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    // If no exact match, fall back to generating breadcrumbs from the path
    const segments = pathname.split('/').filter(Boolean);
    const labels: Record<string, string> = {
      dashboard: t('dashboard'),
      overview: t('overview'),
      workspace: t('workspace'),
      system: t('system'),
      user: t('users'),
      role: t('roles'),
      'user-group': t('groups'),
      action: t('actions'),
      dictionary: t('dictionaries'),
      whitelist: t('whitelist'),
      profile: t('profile')
    };
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        title: labels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1),
        link: path
      };
    });
  }, [pathname, t]);

  return breadcrumbs;
}

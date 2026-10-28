'use client';

import { useCatalogLabels } from '@/features/permissions/catalog-context';
import type { PermissionNavigation } from '@/features/auth/api';
import { Icons } from '@/components/icons';
import { GoCinchLogo } from '@/components/go-cinch-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail
} from '@/components/ui/sidebar';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale } from '@/features/i18n/locale-context';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

const systemItems = [
  { key: 'users', path: '/system/user', menu: '/system/user', icon: Icons.users },
  {
    key: 'roles',
    path: '/system/role',
    menu: '/system/role',
    icon: Icons.shieldCheck
  },
  {
    key: 'groups',
    path: '/system/user-group',
    menu: '/system/user-group',
    icon: Icons.usersGroup
  },
  {
    key: 'actions',
    path: '/system/action',
    menu: '/system/action',
    icon: Icons.key
  },
  {
    key: 'dictionaries',
    path: '/system/dictionary',
    menu: '/system/dictionary',
    icon: Icons.book2
  },
  { key: 'developer', path: '/system/developer', menu: '/system/developer', icon: Icons.code },
  {
    key: 'messages',
    path: '/system/msg',
    menu: '/system/msg',
    icon: Icons.notification
  }
] as const;

export default function AppSidebar() {
  const { label } = useCatalogLabels();
  const pathname = usePathname();
  const auth = useAuth();
  const { t } = useLocale();
  const menus = auth.user?.permission?.menus ?? [];
  const allowed = (menu: string) => menus.includes('*') || menus.includes(menu);
  const visibleSystem = systemItems.filter((item) => allowed(item.menu));
  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <div className='flex h-10 items-center gap-2 px-2 font-semibold'>
          <GoCinchLogo className='size-8' />
          <span className='group-data-[collapsible=icon]:hidden'>Go Cinch Admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href='/dashboard/overview' aria-label={t('overview')} />}
                isActive={pathname === '/dashboard/overview'}
              >
                <Icons.dashboard />
                <span>{t('overview')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {auth.user?.permission.navigation?.length
              ? auth.user.permission.navigation.map((node) => (
                  <NavigationNode
                    key={node.resource_key}
                    node={node}
                    pathname={pathname}
                    label={label}
                  />
                ))
              : visibleSystem.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      render={<Link href={item.path} aria-label={t(item.key)} />}
                      isActive={pathname === item.path}
                    >
                      <item.icon />
                      <span>{t(item.key)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size='lg' aria-label={auth.user?.username || t('profile')} />
                }
              >
                <div className='flex size-8 items-center justify-center rounded-lg bg-muted'>
                  <Icons.user className='size-4' />
                </div>
                <div className='grid flex-1 text-left text-sm'>
                  <span className='truncate font-medium'>{auth.user?.username}</span>
                  <span className='truncate text-xs text-muted-foreground'>
                    {auth.user?.role?.name || auth.user?.code}
                  </span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent side='right' align='end' className='min-w-52'>
                <DropdownMenuItem render={<Link href='/profile' aria-label={t('profile')} />}>
                  <Icons.user className='mr-2 size-4' />
                  {t('profile')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void auth.signOut()}>
                  <Icons.logout className='mr-2 size-4' />
                  {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavigationNode({
  node,
  pathname,
  label
}: {
  node: PermissionNavigation;
  pathname: string;
  label: (kind: string, key: string) => string;
}) {
  const title = label('resources', node.resource_key);
  const Icon = systemItems.find(item => item.path === node.menu_path)?.icon
    ?? (node.menu_path === '/dashboard/workspace' ? Icons.workspace
      : node.menu_path === '/audit/login' ? Icons.login
        : node.menu_path === '/audit/operation' ? Icons.listCheck : Icons.page);
  if (node.menu_path) {
    if (node.menu_path === '/dashboard/overview') return null;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          render={<Link href={node.menu_path} aria-label={title} />}
          isActive={pathname === node.menu_path}
        >
          <Icon />
          <span>{title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
  const active = (item: PermissionNavigation): boolean =>
    item.menu_path === pathname || !!item.children?.some(active);
  return (
    <Collapsible
      key={`${node.resource_key}-${active(node)}`}
      defaultOpen={active(node)}
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={<SidebarMenuButton aria-label={title} className='group/collapsible' />}
      >
        <Icons.kanban />
        <span>{title}</span>
        <Icons.chevronRight className='ml-auto size-4 group-data-panel-open/collapsible:rotate-90' />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {node.children?.map((child) => (
            <NavigationNode
              key={child.resource_key}
              node={child}
              pathname={pathname}
              label={label}
            />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

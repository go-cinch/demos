'use client';

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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale } from '@/features/i18n/locale-context';
import {
  IconBook2,
  IconChevronRight,
  IconDashboard,
  IconKey,
  IconListCheck,
  IconLogout,
  IconSettings,
  IconShieldCheck,
  IconUser,
  IconUsers,
  IconUsersGroup
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

const systemItems = [
  { key: 'users', path: '/system/user', menu: '/system/user', icon: IconUsers },
  { key: 'roles', path: '/system/role', menu: '/system/role', icon: IconShieldCheck },
  { key: 'groups', path: '/system/user-group', menu: '/system/group', icon: IconUsersGroup },
  { key: 'actions', path: '/system/action', menu: '/system/action', icon: IconKey },
  { key: 'dictionaries', path: '/system/dictionary', menu: '/system/dictionary', icon: IconBook2 },
  { key: 'whitelist', path: '/system/whitelist', menu: '/system/whitelist', icon: IconListCheck }
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const { t } = useLocale();
  const menus = auth.user?.permission?.menus ?? [];
  const allowed = (menu: string) => menus.includes('*') || menus.includes(menu);
  const visibleSystem = systemItems.filter((item) => allowed(item.menu));
  const dashboardItems = [
    { key: 'overview' as const, path: '/dashboard/overview', icon: IconDashboard },
    ...(menus.includes('*')
      ? [{ key: 'workspace' as const, path: '/dashboard/workspace', icon: IconSettings }]
      : [])
  ];
  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <div className='flex h-10 items-center gap-2 px-2 font-semibold'>
          <div className='flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
            G
          </div>
          <span className='group-data-[collapsible=icon]:hidden'>Go Cinch Admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {dashboardItems.length > 0 && (
          <SidebarGroup>
            <SidebarMenu>
              <Collapsible
                key={`dashboard-${pathname.startsWith('/dashboard')}`}
                defaultOpen={pathname.startsWith('/dashboard')}
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      aria-label={t('dashboard')}
                      tooltip={t('dashboard')}
                      className='group/collapsible'
                    />
                  }
                >
                  <IconDashboard />
                  <span>{t('dashboard')}</span>
                  <IconChevronRight className='ml-auto size-4 transition-transform duration-200 group-data-panel-open/collapsible:rotate-90' />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {dashboardItems.map((item) => (
                      <SidebarMenuSubItem key={item.path}>
                        <SidebarMenuSubButton
                          render={<Link href={item.path} aria-label={t(item.key)} />}
                          isActive={pathname === item.path}
                        >
                          <item.icon className='size-4' />
                          <span>{t(item.key)}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {visibleSystem.length > 0 && (
          <SidebarGroup>
            <SidebarMenu>
              <Collapsible
                key={`system-${pathname.startsWith('/system')}`}
                defaultOpen={pathname.startsWith('/system')}
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      aria-label={t('system')}
                      tooltip={t('system')}
                      className='group/collapsible'
                    />
                  }
                >
                  <IconSettings />
                  <span>{t('system')}</span>
                  <IconChevronRight className='ml-auto size-4 transition-transform duration-200 group-data-panel-open/collapsible:rotate-90' />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {visibleSystem.map((item) => (
                      <SidebarMenuSubItem key={item.path}>
                        <SidebarMenuSubButton
                          render={<Link href={item.path} aria-label={t(item.key)} />}
                          isActive={pathname === item.path}
                        >
                          <item.icon className='size-4' />
                          <span>{t(item.key)}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroup>
        )}
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
                  <IconUser className='size-4' />
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
                  <IconUser className='mr-2 size-4' />
                  {t('profile')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void auth.signOut()}>
                  <IconLogout className='mr-2 size-4' />
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

'use client';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/i18n/locale-context';
import { IconPin, IconPinned, IconX } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

interface OpenTab {
  path: string;
  pinned: boolean;
}

const STORAGE_KEY = 'go-cinch-open-tabs';

const titleKeys: Record<
  string,
  | 'overview'
  | 'workspace'
  | 'users'
  | 'roles'
  | 'groups'
  | 'actions'
  | 'dictionaries'
  | 'whitelist'
  | 'profile'
> = {
  '/dashboard/overview': 'overview',
  '/dashboard/workspace': 'workspace',
  '/system/user': 'users',
  '/system/role': 'roles',
  '/system/user-group': 'groups',
  '/system/action': 'actions',
  '/system/dictionary': 'dictionaries',
  '/system/whitelist': 'whitelist',
  '/profile': 'profile'
};

function readTabs(): OpenTab[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as OpenTab[];
    return Array.isArray(saved) ? saved.filter((tab) => titleKeys[tab.path]) : [];
  } catch {
    return [];
  }
}

export function PageTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, pick } = useLocale();
  const [tabs, setTabs] = React.useState<OpenTab[]>([
    { path: '/dashboard/overview', pinned: true }
  ]);

  React.useEffect(() => {
    const saved = readTabs();
    const normalized = saved.some((tab) => tab.path === '/dashboard/overview')
      ? saved.map((tab) => (tab.path === '/dashboard/overview' ? { ...tab, pinned: true } : tab))
      : [{ path: '/dashboard/overview', pinned: true }, ...saved];
    const next =
      titleKeys[pathname] && !normalized.some((tab) => tab.path === pathname)
        ? [...normalized, { path: pathname, pinned: false }]
        : normalized;
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize persisted tabs with client-side navigation
    setTabs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [pathname]);

  function update(next: OpenTab[]) {
    setTabs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function closeTab(path: string) {
    const index = tabs.findIndex((tab) => tab.path === path);
    const next = tabs.filter((tab) => tab.path !== path || tab.pinned);
    if (next.length === tabs.length) return;
    update(next);
    if (pathname === path) router.push(next[Math.max(0, index - 1)]?.path ?? '/dashboard/overview');
  }

  return (
    <nav
      aria-label={pick('Opened pages', '已打开页面')}
      className='flex min-h-10 items-center gap-1 overflow-x-auto border-b bg-background px-4 py-1'
    >
      {tabs.map((tab) => {
        const active = pathname === tab.path;
        const key = titleKeys[tab.path];
        return (
          <div
            key={tab.path}
            className={`group/tab flex shrink-0 items-center rounded-md border text-sm ${active ? 'border-primary/40 bg-primary/10 text-primary' : 'bg-background text-muted-foreground'}`}
          >
            <button type='button' className='px-3 py-1.5' onClick={() => router.push(tab.path)}>
              {t(key)}
            </button>
            {tab.path !== '/dashboard/overview' && (
              <Button
                type='button'
                size='icon-xs'
                variant='ghost'
                className='opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100'
                aria-label={
                  tab.pinned ? pick('Unpin tab', '取消固定标签') : pick('Pin tab', '固定标签')
                }
                onClick={() =>
                  update(
                    tabs.map((item) =>
                      item.path === tab.path ? { ...item, pinned: !item.pinned } : item
                    )
                  )
                }
              >
                {tab.pinned ? <IconPinned /> : <IconPin />}
              </Button>
            )}
            {!tab.pinned && (
              <Button
                type='button'
                size='icon-xs'
                variant='ghost'
                aria-label={pick('Close tab', '关闭标签')}
                onClick={() => closeTab(tab.path)}
              >
                <IconX />
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

'use client';
import { navGroups } from '@/config/nav-config';
import { KBarAnimator, KBarPortal, KBarPositioner, KBarProvider, KBarSearch } from 'kbar';
import { Kbd } from '@/components/ui/kbd';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useLocale } from '@/features/i18n/locale-context';
import RenderResults from './render-result';
import useThemeSwitching from './use-theme-switching';

const filteredGroups = navGroups;

export default function KBar({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { locale, pick } = useLocale();

  // These action are for the navigation
  const actions = useMemo(() => {
    // Define navigateTo inside the useMemo callback to avoid dependency array issues
    const navigateTo = (url: string) => {
      router.push(url);
    };

    const allItems = filteredGroups.flatMap((group) => group.items);

    const titleFor = (title: string) => {
      const [english, chinese] = title.split(' / ');
      return chinese ? (locale === 'zh-CN' ? chinese : english) : title;
    };

    return allItems.flatMap((navItem) => {
      const title = titleFor(navItem.title);
      // Only include base action if the navItem has a real URL and is not just a container
      const baseAction =
        navItem.url !== '#'
          ? {
              id: `${navItem.url}Action`,
              name: title,
              shortcut: navItem.shortcut,
              keywords: title.toLowerCase(),
              section: pick('Navigation', '导航'),
              subtitle: pick(`Go to ${title}`, `前往${title}`),
              perform: () => navigateTo(navItem.url)
            }
          : null;

      // Map child items into actions
      const childActions =
        navItem.items?.map((childItem) => ({
          id: `${childItem.url}Action`,
          name: titleFor(childItem.title),
          shortcut: childItem.shortcut,
          keywords: titleFor(childItem.title).toLowerCase(),
          section: title,
          subtitle: pick(`Go to ${titleFor(childItem.title)}`, `前往${titleFor(childItem.title)}`),
          perform: () => navigateTo(childItem.url)
        })) ?? [];

      // Return only valid actions (ignoring null base actions for containers)
      return baseAction ? [baseAction, ...childActions] : childActions;
    });
  }, [locale, pick, router]);

  return (
    <KBarProvider actions={actions}>
      <KBarComponent>{children}</KBarComponent>
    </KBarProvider>
  );
}
const KBarComponent = ({ children }: { children: React.ReactNode }) => {
  const { pick } = useLocale();
  useThemeSwitching();

  return (
    <>
      <KBarPortal>
        <KBarPositioner className='bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-99999 flex items-start! justify-center p-4! pt-[14vh]!'>
          <KBarAnimator className='bg-popover text-popover-foreground ring-foreground/10 relative mx-auto w-full max-w-[600px] overflow-hidden rounded-xl shadow-lg ring-1'>
            <div className='bg-popover sticky top-0 z-10 border-b'>
              <KBarSearch className='placeholder:text-muted-foreground w-full border-none bg-transparent px-4 py-3.5 text-sm outline-hidden focus:ring-0 focus:outline-hidden' />
            </div>
            <div className='h-[400px]'>
              <RenderResults />
            </div>
            <div className='text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-xs'>
              <span className='flex items-center gap-1'>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> {pick('navigate', '选择')}
              </span>
              <span className='flex items-center gap-1'>
                <Kbd>↵</Kbd> {pick('open', '打开')}
              </span>
              <span className='flex items-center gap-1'>
                <Kbd>esc</Kbd> {pick('close', '关闭')}
              </span>
            </div>
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
      {children}
    </>
  );
};

'use client';

import { Breadcrumbs } from '@/components/breadcrumbs';
import SearchInput from '@/components/search-input';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { ThemeSelector } from '@/components/themes/theme-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale } from '@/features/i18n/locale-context';
import { useCopyright } from '@/features/preferences/copyright-context';
import {
  IconBell,
  IconLock,
  IconLogout,
  IconMaximize,
  IconMinimize,
  IconSettings,
  IconUser
} from '@tabler/icons-react';
import Link from 'next/link';
import * as React from 'react';

const timezones = [
  { value: 'local', label: 'Local' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' }
];

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}

export default function Header() {
  const auth = useAuth();
  const { locale, setLocale, pick, timezone, setTimezone } = useLocale();
  const [fullscreen, setFullscreen] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const { preferences: copyright, update: updateCopyright } = useCopyright();

  React.useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  return (
    <>
      <header className='sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 bg-background/85 backdrop-blur-md md:h-14'>
        <div className='flex min-w-0 items-center gap-2 px-4'>
          <SidebarTrigger className='-ml-1' />
          <Separator orientation='vertical' className='mr-2 h-4 data-vertical:self-center' />
          <Breadcrumbs />
        </div>
        <div className='flex min-w-0 items-center gap-1 overflow-x-auto px-4'>
          <div className='hidden md:block'>
            <SearchInput />
          </div>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  title={pick('Advanced settings', '高级配置')}
                  aria-label={pick('Advanced settings', '高级配置')}
                />
              }
            >
              <IconSettings />
            </PopoverTrigger>
            <PopoverContent align='end' className='max-h-[80vh] w-88 overflow-y-auto'>
              <h2 className='font-semibold'>{pick('Advanced settings', '高级配置')}</h2>
              <h3 className='mt-4 text-xs font-semibold uppercase text-muted-foreground'>
                {pick('Layout', '布局设置')}
              </h3>
              <div className='mt-3'>
                <ThemeSelector />
              </div>
              <h3 className='mt-5 font-medium'>{pick('Copyright', '版权设置')}</h3>
              <div className='mt-3 flex items-center justify-between'>
                <Label htmlFor='copyright-enabled'>{pick('Show copyright', '显示版权')}</Label>
                <Switch
                  id='copyright-enabled'
                  checked={copyright.enabled}
                  onCheckedChange={(enabled) => updateCopyright({ enabled })}
                />
              </div>
              {(
                [
                  ['date', pick('Date or year', '日期或年份')],
                  ['company', pick('Company name', '公司名称')],
                  ['companyLink', pick('Company link', '公司链接')],
                  ['icp', pick('ICP text', 'ICP备案文本')],
                  ['icpLink', pick('ICP link', 'ICP备案链接')]
                ] as const
              ).map(([key, label]) => (
                <div className='mt-3 space-y-1.5' key={key}>
                  <Label htmlFor={`copyright-${key}`}>{label}</Label>
                  <Input
                    id={`copyright-${key}`}
                    value={copyright[key]}
                    onChange={(event) => updateCopyright({ [key]: event.target.value })}
                  />
                </div>
              ))}
            </PopoverContent>
          </Popover>
          <ThemeModeToggle />
          <Button
            variant='outline'
            size='sm'
            onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
            aria-label={pick('Switch language', '切换语言')}
          >
            {locale === 'zh-CN' ? 'EN' : '中文'}
          </Button>
          <Select value={timezone} onValueChange={(value) => value && setTimezone(value)}>
            <SelectTrigger
              className='hidden h-8 w-32 lg:flex'
              aria-label={pick('Timezone', '时区')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.value === 'local' ? pick('Local time', '本地时区') : item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant='ghost'
            size='icon'
            title={pick('Fullscreen', '全屏')}
            aria-label={pick('Fullscreen', '全屏')}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <IconMinimize /> : <IconMaximize />}
          </Button>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  title={pick('Messages', '消息')}
                  aria-label={pick('Messages', '消息')}
                />
              }
            >
              <IconBell />
            </PopoverTrigger>
            <PopoverContent align='end' className='w-72'>
              <div className='font-medium'>{pick('Messages', '消息')}</div>
              <p className='mt-2 text-sm text-muted-foreground'>
                {pick('No new messages', '暂无新消息')}
              </p>
            </PopoverContent>
          </Popover>
          <Button
            variant='ghost'
            size='icon'
            title={pick('Lock screen', '锁定屏幕')}
            aria-label={pick('Lock screen', '锁定屏幕')}
            onClick={() => setLocked(true)}
          >
            <IconLock />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={auth.user?.username || pick('Account', '账户')}
                />
              }
            >
              <IconUser />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='min-w-48'>
              <DropdownMenuItem
                render={<Link href='/profile' aria-label={pick('Profile', '个人中心')} />}
              >
                <IconUser />
                {pick('Profile', '个人中心')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void auth.signOut()}>
                <IconLogout />
                {pick('Sign out', '退出登录')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {locked && (
        <div className='fixed inset-0 z-100 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md'>
          <div className='w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow-xl'>
            <IconLock className='mx-auto size-10 text-primary' />
            <h2 className='mt-4 text-xl font-semibold'>{pick('Screen locked', '屏幕已锁定')}</h2>
            <p className='mt-2 text-sm text-muted-foreground'>
              {pick('Sign in again to continue securely.', '请重新登录以安全地继续。')}
            </p>
            <Button className='mt-6 w-full' onClick={() => void auth.signOut()}>
              {pick('Return to sign in', '返回登录')}
            </Button>
            <Button variant='ghost' className='mt-2 w-full' onClick={() => setLocked(false)}>
              {pick('Cancel', '取消')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

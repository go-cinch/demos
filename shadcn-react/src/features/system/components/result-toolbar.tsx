'use client';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icons } from '@/components/icons';
import { useLocale } from '@/features/i18n/locale-context';
export type Density = 'compact' | 'default' | 'loose';
export default function ResultToolbar({
  loading,
  refresh,
  density,
  setDensity,
  fullscreen,
  toggleFullscreen,
  bordered,
  setBordered,
  striped,
  setStriped,
  sticky,
  setSticky,
  children
}: {
  loading: boolean;
  refresh: () => void;
  density: Density;
  setDensity: (v: Density) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  bordered: boolean;
  setBordered: (v: boolean) => void;
  striped: boolean;
  setStriped: (v: boolean) => void;
  sticky: boolean;
  setSticky: (v: boolean) => void;
  children: ReactNode;
}) {
  const { pick } = useLocale();
  return (
    <>
      {' '}
      <Button
        aria-label={pick('Refresh', '刷新')}
        title={pick('Refresh', '刷新')}
        size='icon-sm'
        variant='outline'
        onClick={() => refresh()}
        disabled={loading}
      >
        <Icons.refresh className={loading ? 'animate-spin' : ''} />
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              aria-label={pick('Density', '表格密度')}
              title={pick('Density', '表格密度')}
              size='icon-sm'
              variant='outline'
            />
          }
        >
          <Icons.list />
        </PopoverTrigger>
        <PopoverContent align='end' className='w-36'>
          {(['compact', 'default', 'loose'] as Density[]).map((item) => (
            <Button
              key={item}
              variant={density === item ? 'secondary' : 'ghost'}
              className='justify-start'
              onClick={() => setDensity(item)}
            >
              {item === 'compact'
                ? pick('Compact', '紧凑')
                : item === 'loose'
                  ? pick('Loose', '宽松')
                  : pick('Default', '默认')}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        aria-label={pick('Fullscreen', '全屏')}
        title={pick('Fullscreen', '全屏')}
        size='icon-sm'
        variant='outline'
        onClick={() => toggleFullscreen()}
      >
        {fullscreen ? <Icons.minimize /> : <Icons.maximize />}
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              aria-label={pick('Visible columns', '显示列')}
              title={pick('Visible columns', '显示列')}
              size='icon-sm'
              variant='outline'
            />
          }
        >
          <Icons.columns />
        </PopoverTrigger>
        <PopoverContent align='end' className='w-64'>
          {children}
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              aria-label={pick('Table style', '表格样式')}
              title={pick('Table style', '表格样式')}
              size='icon-sm'
              variant='outline'
            />
          }
        >
          <Icons.tableSettings />
        </PopoverTrigger>
        <PopoverContent align='end' className='w-52'>
          <div className='flex items-center justify-between gap-3'>
            {pick('Bordered', '边框')}
            <Switch
              aria-label={pick('Bordered', '边框')}
              checked={bordered}
              onCheckedChange={setBordered}
            />
          </div>
          <div className='flex items-center justify-between gap-3'>
            {pick('Striped', '斑马纹')}
            <Switch
              aria-label={pick('Striped', '斑马纹')}
              checked={striped}
              onCheckedChange={setStriped}
            />
          </div>
          <div className='flex items-center justify-between gap-3'>
            {pick('Sticky', '固定表头')}
            <Switch
              aria-label={pick('Sticky', '固定表头')}
              checked={sticky}
              onCheckedChange={setSticky}
            />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

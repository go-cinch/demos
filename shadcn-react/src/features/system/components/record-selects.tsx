'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useLocale } from '@/features/i18n/locale-context';
import { listRecords } from '../api';
import type { FieldConfig } from '../types';
export function StyledSelect({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className = 'w-full'
}: {
  id?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const normalizedValue = value === '' ? '__all__' : value;
  const selectedLabel =
    options.find((option) => (option.value || '__all__') === normalizedValue)?.label ?? value;
  return (
    <Select
      value={normalizedValue}
      onValueChange={(next) => onChange(next === '__all__' || next == null ? '' : next)}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('h-9', className)}>
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value || '__all__'} value={option.value || '__all__'}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

interface RelationOption {
  label: string;
  value: string | number;
}

export function RelationPicker({
  field,
  resource,
  multiple = false,
  value,
  onChange,
  loadOptions
}: {
  field: Pick<FieldConfig, 'key' | 'label'>;
  resource: 'action' | 'role' | 'user';
  multiple?: boolean;
  value: Array<string | number> | string | number;
  onChange: (value: unknown) => void;
  loadOptions?: (query: string) => Promise<RelationOption[]>;
}) {
  const { pick } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<RelationOption[]>([]);
  const selected = multiple
    ? (value as Array<string | number>)
    : value
      ? [value as string | number]
      : [];
  const selectedKey = selected.map(String).join('\u0000');
  React.useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const fetched = loadOptions
          ? await loadOptions(query)
          : await (async () => {
              const results = query
                ? await Promise.all(
                    resource === 'user'
                      ? [
                          listRecords('user', { p: 1, s: 20, username: query }),
                          listRecords('user', { p: 1, s: 20, code: query })
                        ]
                      : [
                          listRecords(resource, { p: 1, s: 20, name: query }),
                          listRecords(resource, { p: 1, s: 20, word: query })
                        ]
                  )
                : [await listRecords(resource, { p: 1, s: 20 })];
              return results
                .flatMap((result) => result.items)
                .map((item) => {
                  const option = {
                    value: resource === 'action' ? String(item.code) : Number(item.id),
                    label:
                      resource === 'user'
                        ? `${item.username} · ${item.code}`
                        : resource === 'action'
                          ? `${item.name} · ${item.word} (${item.code})`
                          : `${item.name} · ${item.word}`
                  } satisfies RelationOption;
                  return option;
                });
            })();
        if (!active) return;
        setOptions((current) => {
          const selectedValues = new Set(selectedKey.split('\u0000').filter(Boolean));
          const next = new Map(
            current
              .filter((option) => selectedValues.has(String(option.value)))
              .map((option) => [String(option.value), option])
          );
          for (const option of fetched) next.set(String(option.value), option);
          return [...next.values()];
        });
      } catch {
        if (active)
          setOptions((current) => {
            const selectedValues = new Set(selectedKey.split('\u0000').filter(Boolean));
            return current.filter((option) => selectedValues.has(String(option.value)));
          });
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, resource, selectedKey, loadOptions]);
  function toggle(option: RelationOption) {
    if (!multiple) {
      onChange(option.value);
      setOpen(false);
      return;
    }
    const exists = selected.some((item) => String(item) === String(option.value));
    onChange(
      exists
        ? selected.filter((item) => String(item) !== String(option.value))
        : [...selected, option.value]
    );
  }
  return (
    <div className='space-y-2'>
      <Label>{field.label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type='button'
              variant='outline'
              className='h-auto min-h-9 w-full justify-between whitespace-normal'
              aria-label={field.label}
            />
          }
        >
          <span className='flex flex-wrap gap-1 text-left'>
            {selected.length ? (
              selected.map((item) => (
                <Badge key={String(item)} variant='secondary'>
                  {options.find((option) => String(option.value) === String(item))?.label ??
                    String(item)}
                </Badge>
              ))
            ) : (
              <span className='text-muted-foreground'>
                {pick('Search and select', '搜索并选择')}
              </span>
            )}
          </span>
          <Icons.chevronDown className='size-4 shrink-0' />
        </PopoverTrigger>
        <PopoverContent align='start' className='w-[min(34rem,calc(100vw-3rem))]'>
          <Input
            aria-label={pick(`Search ${field.label}`, `搜索${field.label}`)}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={pick('Search by name or code', '按名称或编码搜索')}
            autoFocus
          />
          {!multiple && (
            <Button
              type='button'
              variant='ghost'
              className='justify-start'
              onClick={() => {
                onChange(0);
                setOpen(false);
              }}
            >
              <Icons.close />
              {pick('None', '无')}
            </Button>
          )}
          <div className='max-h-64 space-y-1 overflow-auto'>
            {options.length === 0 ? (
              <p className='p-3 text-center text-muted-foreground'>
                {pick('No results', '暂无结果')}
              </p>
            ) : (
              options.map((option) => {
                const checked = selected.some((item) => String(item) === String(option.value));
                return (
                  <button
                    type='button'
                    key={String(option.value)}
                    className='flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted'
                    onClick={() => toggle(option)}
                  >
                    {multiple && <Checkbox checked={checked} tabIndex={-1} />}
                    {!multiple && checked && <Icons.check className='size-4 text-primary' />}
                    <span>{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <p className='text-xs text-muted-foreground'>
        {resource === 'action'
          ? pick(
              'Search by permission name or key, or open the list to browse.',
              '按权限名称或标识搜索，也可以展开列表选择。'
            )
          : resource === 'role'
            ? pick(
                'Search by role name or key, or open the list to browse.',
                '按角色名称或标识搜索，也可以展开列表选择。'
              )
            : pick(
                'Search by username or user code, or open the list to browse.',
                '按用户名或用户编码搜索，也可以展开列表选择。'
              )}
      </p>
    </div>
  );
}

'use client';

import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/features/i18n/locale-context';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { readLoginAccountHistory, writeLoginAccountHistory } from '../account-history';

interface LoginAccountInputProps {
  error?: string;
  onChange: (value: string) => void;
  value: string;
}

export function LoginAccountInput({ error, onChange, value }: LoginAccountInputProps) {
  const { pick } = useLocale();
  const [history, setHistory] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const showHistory = open && history.length > 0;
  React.useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- hydrate browser-only login account history after mount
    setHistory(readLoginAccountHistory());
  }, []);
  const query = value.trim().toLowerCase();
  const options = history.filter((item) => item.toLowerCase().includes(query));
  React.useEffect(() => {
    if (open && activeIndex >= 0)
      document
        .getElementById(`login-account-option-${activeIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);
  const select = (account: string) => {
    onChange(account);
    setOpen(false);
    setActiveIndex(-1);
  };
  const updateHistory = (accounts: string[]) => {
    setHistory(writeLoginAccountHistory(accounts));
    setActiveIndex(-1);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (options.length)
        setActiveIndex((index) =>
          event.key === 'ArrowDown'
            ? (index + 1) % options.length
            : index <= 0
              ? options.length - 1
              : index - 1
        );
    } else if (event.key === 'Enter' && open && options[activeIndex]) {
      event.preventDefault();
      select(options[activeIndex]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };
  return (
    <div
      className='relative'
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <Input
        id='username'
        name='username'
        role='combobox'
        autoComplete='off'
        aria-autocomplete='list'
        aria-expanded={showHistory}
        aria-controls={showHistory ? 'login-account-options' : undefined}
        aria-activedescendant={
          showHistory && options[activeIndex] ? `login-account-option-${activeIndex}` : undefined
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'username-error' : undefined}
        placeholder={pick('Username', '用户名')}
        value={value}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {showHistory && (
        <div className='absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md'>
          <div className='flex items-center justify-between gap-2 px-2 py-1.5'>
            <p className='text-xs font-medium text-muted-foreground'>
              {pick('Login account history', '历史登录账号')}
            </p>
            {history.length > 0 && (
              <button
                className='rounded px-1 text-xs text-muted-foreground hover:text-destructive'
                type='button'
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => updateHistory([])}
              >
                {pick('Clear history', '清空历史')}
              </button>
            )}
          </div>
          <div
            id='login-account-options'
            role='listbox'
            aria-label={pick('Login account history', '历史登录账号')}
          >
            {options.map((item, index) => (
              <div
                key={item}
                id={`login-account-option-${index}`}
                role='option'
                aria-selected={index === activeIndex}
                className={cn(
                  'flex items-center rounded-md hover:bg-accent',
                  index === activeIndex && 'bg-accent'
                )}
              >
                <button
                  className='min-w-0 flex-1 truncate rounded-md px-2 py-2 text-start text-sm'
                  type='button'
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(item)}
                >
                  <Highlighted value={item} query={query} />
                </button>
                <button
                  aria-label={pick(`Remove ${item} from history`, `从历史记录中移除“${item}”`)}
                  className='me-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
                  type='button'
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => updateHistory(history.filter((account) => account !== item))}
                >
                  <Icons.close className='size-3.5' />
                </button>
              </div>
            ))}
          </div>
          {options.length === 0 && (
            <p role='status' className='px-2 py-3 text-sm text-muted-foreground'>
              {pick('No matching accounts', '没有匹配的账号')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Highlighted({ query, value }: { query: string; value: string }) {
  const index = value.toLowerCase().indexOf(query);
  if (!query || index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className='bg-transparent font-semibold text-destructive'>
        {value.slice(index, index + query.length)}
      </mark>
      {value.slice(index + query.length)}
    </>
  );
}

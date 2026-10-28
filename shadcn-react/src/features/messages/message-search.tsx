'use client';
import { useEffect, useRef, useState } from 'react';
import { msgApi } from '@/features/messages/api/service';
import { useAdminText } from '@/features/system/components/admin-ui';
export default function MessageSearch({
  value,
  onSearch
}: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const text = useAdminText(),
    [draft, setDraft] = useState(value),
    [suggestions, setSuggestions] = useState<string[]>([]),
    [history, setHistory] = useState<string[]>([]),
    [open, setOpen] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setSuggestions([]);
    if (!draft.trim()) return;
    const timeout = setTimeout(
      () =>
        msgApi
          .list(true, { q: draft.trim(), f: 'title', p: 1, s: 8 })
          .then((data) => {
            if (active) setSuggestions([...new Set(data.items.map((row) => row.title))]);
          })
          .catch(() => {}),
      200
    );
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [draft]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function search(value = draft) {
    clearTimeout(timer.current);
    const next = value.trim();
    setDraft(next);
    setOpen(false);
    if (next) setHistory((old) => [next, ...old.filter((value) => value !== next)].slice(0, 8));
    onSearch(next);
  }
  return (
    <div className='relative min-w-60 flex-1'>
      <label className='mb-2 block text-sm'>{text('msg.keyword')}</label>
      <input
        aria-label={text('msg.searchMessages')}
        placeholder={text('msg.searchMessages')}
        className='w-full rounded-lg border bg-transparent p-2.5 text-sm'
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value.trim()) search('');
        }}
        onFocus={() => {
          clearTimeout(timer.current);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          timer.current = setTimeout(() => search(), 300);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            search();
          }
        }}
      />
      {open && (
        <div className='absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-card p-2 shadow-lg'>
          {[...new Set([...history, ...suggestions])]
            .filter((value) => value.toLocaleLowerCase().includes(draft.toLocaleLowerCase()))
            .map((value) => (
              <button
                type='button'
                key={value}
                className='block w-full break-words p-2 text-start text-sm hover:bg-muted'
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => search(value)}
              >
                {value}
                {history.includes(value) && (
                  <span className='ms-2 text-xs opacity-60'>{text('msg.searchHistory')}</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

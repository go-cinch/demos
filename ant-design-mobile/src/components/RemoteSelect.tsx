import { useEffect, useRef, useState } from 'react';
import { Button, SearchBar } from 'antd-mobile';
import { listResource, request } from '../lib/api';
import { loadOptionPage } from '../lib/option-pages';
import type { ResourceKind } from '../lib/types';
import { t } from '../locales';
import { Sheet, Icon, Loading, ErrorBox, NoData } from './UI';
export interface Option {
  value: string | number;
  label: string;
}
export default function RemoteSelect({
  name,
  label,
  value,
  onChange,
  resource,
  multiple = false,
  group = false,
  options,
  initial = [],
}: {
  name: string;
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  resource?: ResourceKind;
  multiple?: boolean;
  group?: boolean;
  options?: Option[];
  initial?: Option[];
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [loaded, setLoaded] = useState<Option[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const labels = useRef(new Map<string | number, string>());
  initial.forEach((x) => labels.current.set(x.value, x.label));
  const selected = (
    Array.isArray(value)
      ? value
      : value !== undefined && value !== null && value !== ''
        ? [value]
        : []
  ) as (string | number)[];
  const choices = options || loaded;
  useEffect(() => {
    if (!open || options) return;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        setBusy(true);
        setError('');
        try {
          let data: Option[] = [];
          let more = false;
          if (group) {
            const result = await request<{ items: string[] }>(
              `/action/group?keyword=${encodeURIComponent(query)}`,
            );
            data = result.items.map((value) => ({ value, label: value }));
          } else if (resource) {
            const result = await loadOptionPage(resource, query, page, listResource);
            data = result.items;
            more = result.hasMore;
          }
          if (!cancelled) {
            setHasMore(more);
            setLoaded((previous) =>
              page === 1
                ? data
                : [...new Map([...previous, ...data].map((item) => [item.value, item])).values()],
            );
            data.forEach((x) => labels.current.set(x.value, x.label));
          }
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        } finally {
          if (!cancelled) setBusy(false);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, resource, group, options, retry, page]);
  function choose(v: string | number) {
    onChange(
      multiple ? (selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]) : v,
    );
    if (!multiple) setOpen(false);
  }
  const text = (v: string | number) =>
    labels.current.get(v) || choices.find((x) => x.value === v)?.label || String(v);
  return (
    <>
      <button
        id={name}
        type="button"
        className="select-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setPage(1);
          setLoaded([]);
          setHasMore(false);
          setOpen(true);
        }}
      >
        <span className={!selected.length ? 'muted' : ''}>
          {selected.map(text).join('、') || t('choose')}
        </span>
        <Icon name="chevron-down" size={18} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        top={
          <>
            {(resource || group) && (
              <SearchBar
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                  setLoaded([]);
                  setHasMore(false);
                }}
                placeholder={t('searchOptions')}
                aria-label={t('searchOptions')}
              />
            )}
            {multiple && (
              <p className="selection-count" role="status">
                {t('selected', { count: selected.length })}
              </p>
            )}
          </>
        }
        footer={
          <div className="sheet-actions">
            <Button onClick={() => onChange(multiple ? [] : undefined)}>{t('clear')}</Button>
            <Button color="primary" onClick={() => setOpen(false)}>
              {t('done')}
            </Button>
          </div>
        }
      >
        <div className="selected-options">
          {selected.map((v) => (
            <button
              className="resource-tag"
              type="button"
              key={v}
              onClick={() => onChange(multiple ? selected.filter((x) => x !== v) : undefined)}
            >
              {text(v)} <Icon name="close" size={12} />
            </button>
          ))}
        </div>
        <ErrorBox error={error} retry={() => setRetry((x) => x + 1)} />
        {busy && <Loading />}
        <div role="listbox" aria-label={label} aria-multiselectable={multiple}>
          {choices.map((item) => (
            <button
              key={item.value}
              type="button"
              className="option-row"
              role="option"
              aria-selected={selected.includes(item.value)}
              onClick={() => choose(item.value)}
            >
              <span className="option-copy">
                {item.label.includes(' · ') ? (
                  <>
                    <strong>{item.label.split(' · ')[0]}</strong>
                    <small> · {item.label.split(' · ').slice(1).join(' · ')}</small>
                  </>
                ) : (
                  item.label
                )}
              </span>
              <span className={`option-indicator ${multiple ? 'multiple' : ''}`} aria-hidden="true">
                {selected.includes(item.value) && <Icon name="check" size={18} />}
              </span>
            </button>
          ))}
          {group && query.trim() && !choices.some((x) => x.value === query.trim()) && (
            <button type="button" className="option-row" onClick={() => choose(query.trim())}>
              {t('createGroup', { name: query.trim() })}
            </button>
          )}
        </div>
        {!busy && !choices.length && !group && <NoData text={t('noResults')} />}
        {hasMore && (
          <Button block loading={busy} onClick={() => setPage((v) => v + 1)}>
            {t('loadMore')}
          </Button>
        )}
      </Sheet>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Input } from 'antd-mobile';
import { listResource } from '../lib/api';
import { readStored, writeStored } from '../lib/storage';
import type { FilterDefinition } from '../lib/resource-config';
import type { ResourceKind } from '../lib/types';
import { t } from '../locales';
import RemoteSelect from './RemoteSelect';
import { Icon } from './UI';
export default function SearchField({
  field,
  resource,
  value,
  onChange,
  onSearch,
}: {
  field: FilterDefinition;
  resource: ResourceKind;
  value: unknown;
  onChange: (v: unknown) => void;
  onSearch: () => void;
}) {
  const multiple = field.type === 'input-multi-select';
  const historyKey = `cinch-garnet-filter:${resource}:${field.key}`;
  const [query, setQuery] = useState(''),
    [focused, setFocused] = useState(false),
    [suggestions, setSuggestions] = useState<string[]>([]),
    [history, setHistory] = useState<string[]>(() => readStored(historyKey, [])),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const blur = useRef<ReturnType<typeof setTimeout>>();
  const text = multiple ? query : String(value ?? '');
  const current = useRef({ value, text, onChange, onSearch });
  current.current = { value, text, onChange, onSearch };
  function normalize(v: string) {
    return ['user', 'action'].includes(resource) && field.key === 'code'
      ? v.trim().toUpperCase()
      : v.trim();
  }
  function pick(v: string) {
    clearTimeout(blur.current);
    v = normalize(v);
    if (multiple) {
      onChange([
        ...new Set([
          ...(Array.isArray(current.current.value) ? current.current.value : []),
          ...v.split(',').map(normalize).filter(Boolean),
        ]),
      ]);
      setQuery('');
    } else onChange(v);
    if (v) {
      const h = [v, ...history.filter((x) => x !== v)].slice(0, 10);
      setHistory(h);
      writeStored(historyKey, h);
    }
    setFocused(false);
    setSuggestions([]);
    onSearch();
  }
  useEffect(() => {
    if (!focused) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!text.trim()) {
        setSuggestions([]);
        return;
      }
      setBusy(true);
      setError('');
      try {
        const key = field.suggestion?.fieldKey || field.key;
        const result = await listResource(field.suggestion?.resource || resource, {
          p: 1,
          s: 20,
          [key]: normalize(text),
        });
        if (!cancelled)
          setSuggestions([
            ...new Set(
              result.items.flatMap((r) => (typeof r[key] === 'string' ? [String(r[key])] : [])),
            ),
          ]);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, focused, resource, field.key]);
  useEffect(() => () => clearTimeout(blur.current), []);
  function highlighted(v: string) {
    const i = v.toLowerCase().indexOf(text.toLowerCase());
    return i < 0 || !text ? (
      v
    ) : (
      <>
        {v.slice(0, i)}
        <mark>{v.slice(i, i + text.length)}</mark>
        {v.slice(i + text.length)}
      </>
    );
  }
  const options = field.type.includes('status')
    ? [
        { value: 0, label: t('system.status.pending') },
        { value: 1, label: t('system.status.active') },
        { value: 2, label: t('system.status.locked') },
      ]
    : field.type === 'category'
      ? [
          { value: 0, label: t('system.category.permission') },
          { value: 1, label: t('system.category.jwt') },
        ]
      : [
          { value: 'true', label: t('system.enabled.yes') },
          { value: 'false', label: t('system.enabled.no') },
        ];
  return (
    <div className="search-field">
      <label htmlFor={`filter-${field.key}`}>{field.label}</label>
      {field.type.includes('status') || ['category', 'enabled'].includes(field.type) ? (
        <RemoteSelect
          name={`filter-${field.key}`}
          label={field.label}
          value={value}
          onChange={(v) => {
            onChange(v);
            onSearch();
          }}
          multiple={field.type === 'status-multi-select'}
          options={options}
        />
      ) : (
        <>
          {multiple && Array.isArray(value) && (
            <div className="filter-tags">
              {value.map((v) => (
                <button
                  type="button"
                  className="resource-tag"
                  key={String(v)}
                  aria-label={`${t('clear')} ${field.label}: ${String(v)}`}
                  onClick={() => {
                    onChange(value.filter((x) => x !== v));
                    onSearch();
                  }}
                >
                  {String(v)
                    .split('\n')
                    .map((line, i) => (
                      <span className="tag-line" key={i}>
                        {line}
                      </span>
                    ))}
                  <Icon name="close" size={12} />
                </button>
              ))}
            </div>
          )}
          <div className="search-input">
            <Icon name="search" size={18} />
            <Input
              id={`filter-${field.key}`}
              name={`filter-${field.key}`}
              aria-label={field.label}
              value={text}
              clearable
              placeholder={t('system.common.enter', { field: field.label })}
              onChange={(v) => {
                setFocused(true);
                multiple ? setQuery(v) : onChange(v);
                if (!v) {
                  if (!multiple) onChange('');
                  onSearch();
                }
              }}
              onFocus={() => {
                clearTimeout(blur.current);
                setFocused(true);
              }}
              onBlur={() => {
                blur.current = setTimeout(() => {
                  pick(current.current.text);
                }, 400);
              }}
              onEnterPress={() => pick(text)}
            />
          </div>
          {focused && (suggestions.length || history.length || busy || error) ? (
            <div className="suggestions card" onPointerDown={(e) => e.preventDefault()}>
              <small>
                {t(
                  busy
                    ? 'system.suggestions.searching'
                    : suggestions.length
                      ? 'system.suggestions.backend'
                      : 'system.suggestions.history',
                )}
              </small>
              {error && <p role="alert">{error}</p>}
              {[...new Set([...suggestions, ...history])].slice(0, 15).map((v) => (
                <div className="suggestion-row" key={v}>
                  <button type="button" onClick={() => pick(v)}>
                    {v.split('\n').map((line, i) => (
                      <span className="tag-line" key={i}>
                        {highlighted(line)}
                      </span>
                    ))}
                  </button>
                  {history.includes(v) && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('system.suggestions.removeHistory', { value: v })}
                      onClick={() => {
                        const next = history.filter((x) => x !== v);
                        setHistory(next);
                        writeStored(historyKey, next);
                      }}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

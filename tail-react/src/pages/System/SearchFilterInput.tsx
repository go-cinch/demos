import { listRecords, type ResourceKind, type SystemRecord } from "@/api/system";
import { CloseLineIcon, SearchIcon } from "@/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const storageKey = "vben-system-filter-history";
const inputClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 pe-10 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function readHistory(key: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, unknown>;
    return Array.isArray(stored[key]) ? stored[key].filter((value): value is string => typeof value === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, values: string[]) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, unknown>;
    localStorage.setItem(storageKey, JSON.stringify({ ...stored, [key]: values.slice(0, 10) }));
  } catch {
    localStorage.setItem(storageKey, JSON.stringify({ [key]: values.slice(0, 10) }));
  }
}

export default function SearchFilterInput({ fieldKey, label, onChange, onCommit, resource, value }: { fieldKey: string; label: string; onChange: (value: string) => void; onCommit: (value: string) => void; resource: ResourceKind; value: string }) {
  const { t } = useTranslation();
  const historyKey = `${resource}:${fieldKey}`;
  const [history, setHistory] = useState(() => readHistory(historyKey));
  const [backend, setBackend] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    setHistory(readHistory(historyKey));
    setBackend([]);
  }, [historyKey]);

  useEffect(() => {
    const query = value.trim();
    const currentRequest = ++requestId.current;
    if (!query) {
      setBackend([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const suggestionResource: ResourceKind = fieldKey === "action_code" ? "action" : resource;
        const suggestionField = fieldKey === "action_code" ? "code" : fieldKey;
        const result = await listRecords(suggestionResource, { [suggestionField]: query, p: 1, s: 10 });
        if (requestId.current !== currentRequest) return;
        const values = result.items.flatMap((record: SystemRecord) => {
          const candidate = (record as unknown as Record<string, unknown>)[suggestionField];
          return typeof candidate === "string" || typeof candidate === "number" ? [String(candidate)] : [];
        });
        setBackend([...new Set(values)].filter((item) => item !== value));
      } catch {
        if (requestId.current === currentRequest) setBackend([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fieldKey, resource, value]);

  const visibleHistory = useMemo(() => history.filter((item) => item !== value), [history, value]);
  const save = (nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) return;
    const next = [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, 10);
    setHistory(next);
    writeHistory(historyKey, next);
  };
  const select = (nextValue: string) => {
    onChange(nextValue);
    save(nextValue);
    setOpen(false);
    onCommit(nextValue);
  };
  const removeHistory = (item: string) => {
    const next = history.filter((value) => value !== item);
    setHistory(next);
    writeHistory(historyKey, next);
  };
  const hasSuggestions = backend.length > 0 || visibleHistory.length > 0;

  return <div className="relative"><input aria-label={label} autoComplete="off" className={inputClass} name={fieldKey} onBlur={() => { save(value); setOpen(false); onCommit(value); }} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={label} value={value} /><SearchIcon className="pointer-events-none absolute end-3 top-3 size-5 text-gray-400" />{open && hasSuggestions && <div className="absolute z-50 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">{backend.length > 0 && <SuggestionGroup label={t("search.backend")} items={backend} onSelect={select} query={value} />}{visibleHistory.length > 0 && <SuggestionGroup history label={t("search.history")} items={visibleHistory} onRemove={removeHistory} onSelect={select} query={value} removeLabel={(item) => t("search.removeHistory", { value: item })} />}</div>}</div>;
}

function SuggestionGroup({ history = false, items, label, onRemove, onSelect, query, removeLabel }: { history?: boolean; items: string[]; label: string; onRemove?: (item: string) => void; onSelect: (item: string) => void; query: string; removeLabel?: (item: string) => string }) {
  return <div className="mb-1 last:mb-0"><p className="px-2 py-1 text-xs font-medium uppercase text-gray-400">{label}</p>{items.map((item) => <div className="flex items-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/5" key={item}><button className="min-w-0 flex-1 truncate px-2 py-2 text-start text-sm text-gray-700 dark:text-gray-300" onMouseDown={(event) => { event.preventDefault(); onSelect(item); }} type="button"><Highlighted value={item} query={query} /></button>{history && <button aria-label={removeLabel?.(item)} className="me-1 rounded p-1 text-gray-400 hover:text-error-500" onMouseDown={(event) => { event.preventDefault(); onRemove?.(item); }} type="button"><CloseLineIcon className="size-4" /></button>}</div>)}</div>;
}

function Highlighted({ query, value }: { query: string; value: string }) {
  const index = value.toLowerCase().indexOf(query.trim().toLowerCase());
  if (!query.trim() || index < 0) return value;
  return <>{value.slice(0, index)}<mark className="bg-transparent font-semibold text-error-500">{value.slice(index, index + query.trim().length)}</mark>{value.slice(index + query.trim().length)}</>;
}

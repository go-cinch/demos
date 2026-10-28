'use client';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { msgApi, msgChanged, type Msg } from '@/features/messages/api/service';
import { visitMessages } from '@/features/messages/message-attention';
const pageSize = 10;
export function useInboxFeed(
  identity: number | undefined,
  viewport: RefObject<HTMLDivElement | null>,
  can: (control: string) => boolean
) {
  const [rows, setRows] = useState<Msg[]>([]),
    [total, setTotal] = useState(0),
    [unread, setUnread] = useState<number>(),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true),
    [loadingMore, setLoadingMore] = useState(false),
    [error, setError] = useState(false),
    [moreError, setMoreError] = useState(false),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState<number[]>([]),
    [detailLoading, setDetailLoading] = useState<number>(),
    [detailError, setDetailError] = useState<number>(),
    [selected, setSelected] = useState<number[]>([]),
    [selecting, setSelecting] = useState(false),
    [updates, setUpdates] = useState(false),
    [history, setHistory] = useState<string[]>([]),
    [suggestions, setSuggestions] = useState<string[]>([]),
    [suggesting, setSuggesting] = useState(false);
  const appendBusy = useRef(false),
    loadBusy = useRef(false),
    identityRef = useRef(identity);
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  const generation = useRef(0),
    detailRun = useRef(0),
    pages = useRef(0),
    exhausted = useRef(false),
    needsRebase = useRef(false),
    mounted = useRef(true),
    busyRef = useRef(false),
    searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    latest = useRef<{ count: number; at: number | null } | undefined>(undefined);
  const state = useRef({ rows, expanded, selected, loading, loadingMore, error, busy, total });
  useEffect(() => {
    state.current = { rows, expanded, selected, loading, loadingMore, error, busy, total };
  }, [rows, expanded, selected, loading, loadingMore, error, busy, total]);
  const params = useMemo(
    () => ({
      ...(query ? { q: query } : {}),
      ...(['notice', 'system'].includes(filter) ? { type: filter } : {}),
      ...(['read', 'unread'].includes(filter) ? { read: filter === 'read' } : {})
    }),
    [query, filter]
  );
  const count = useCallback(
    async (notify = false) => {
      try {
        const status = await msgApi.count(identity);
        if (!mounted.current || identityRef.current !== identity) return;
        if (
          notify &&
          latest.current &&
          (latest.current.count !== status.count || latest.current.at !== status.latest_unread_at)
        )
          setUpdates(true);
        latest.current = { count: status.count, at: status.latest_unread_at };
        setUnread(status.count);
      } catch {
        if (mounted.current) setUnread(undefined);
      }
    },
    [identity]
  );
  const refresh = useCallback(
    async (reset = false) => {
      const run = ++generation.current;
      loadBusy.current = true;
      appendBusy.current = false;
      if (!identity) return;
      const depth = reset ? 1 : Math.max(pages.current, 1),
        scrollTop = reset ? 0 : (viewport.current?.scrollTop ?? 0);
      setLoading(true);
      setError(false);
      setLoadingMore(false);
      if (reset) {
        setRows([]);
        setExpanded([]);
        setSelected([]);
        setTotal(0);
        pages.current = 0;
        detailRun.current++;
        setDetailLoading(undefined);
        setDetailError(undefined);
        viewport.current?.scrollTo({ top: 0 });
      }
      try {
        const collected = new Map<number, Msg>();
        let available = 0,
          loaded = 0,
          ended = false;
        for (let page = 1; page <= depth; page++) {
          const result = await msgApi.list(false, { ...params, p: page, s: pageSize });
          if (!mounted.current || run !== generation.current) return;
          available = result.t;
          loaded = page;
          for (const row of result.items) {
            const previous = state.current.rows.find((item) => item.id === row.id);
            collected.set(
              row.id,
              state.current.expanded.includes(row.id) && previous?.content !== undefined
                ? { ...row, content: previous.content }
                : row
            );
          }
          ended = result.items.length < pageSize || page * pageSize >= available;
          if (ended) break;
        }
        setRows([...collected.values()]);
        setTotal(available);
        pages.current = loaded;
        exhausted.current = ended;
        setSelected((old) => old.filter((id) => collected.has(id)));
        setExpanded((old) => old.filter((id) => collected.has(id)));
        setUpdates(false);
        needsRebase.current = false;
        requestAnimationFrame(() => {
          if (run === generation.current && viewport.current)
            viewport.current.scrollTop = scrollTop;
        });
      } catch {
        if (mounted.current && run === generation.current) setError(true);
      } finally {
        if (mounted.current && run === generation.current) {
          loadBusy.current = false;
          setLoading(false);
        }
      }
      if (mounted.current && run === generation.current) void count();
    },
    [identity, params, count, viewport]
  );
  const more = useCallback(async () => {
    const current = state.current;
    if (
      !mounted.current ||
      loadBusy.current ||
      appendBusy.current ||
      current.loading ||
      current.loadingMore ||
      busyRef.current ||
      current.error ||
      exhausted.current ||
      current.rows.length >= current.total
    )
      return;
    if (needsRebase.current) {
      await refresh();
      return;
    }
    const run = generation.current;
    appendBusy.current = true;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const result = await msgApi.list(false, { ...params, p: pages.current + 1, s: pageSize });
      if (!mounted.current || run !== generation.current) return;
      if (result.t < state.current.total) {
        await refresh();
        return;
      }
      setRows((old) => [
        ...new Map([...old, ...result.items.map((row) => {
          const previous = old.find((item) => item.id === row.id);
          return state.current.expanded.includes(row.id) && previous?.content !== undefined
            ? { ...row, content: previous.content } : row;
        })].map((row) => [row.id, row])).values()
      ]);
      pages.current++;
      setTotal(result.t);
      exhausted.current = result.items.length < pageSize || pages.current * pageSize >= result.t;
    } catch {
      if (mounted.current && run === generation.current) setMoreError(true);
    } finally {
      if (mounted.current && run === generation.current) {
        appendBusy.current = false;
        setLoadingMore(false);
      }
    }
  }, [params, refresh]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      detailRun.current++;
      clearTimeout(searchTimer.current);
    };
  }, []);
  useEffect(() => {
    visitMessages(identity);
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setUnread(undefined);
    latest.current = undefined;
    setHistory([]);
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setSuggestions([]);
  }, [identity]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    void refresh(true);
  }, [refresh]);
  useEffect(() => {
    async function changed() {
      if (document.hidden || busyRef.current || state.current.loading) return;
      if (
        (viewport.current?.scrollTop ?? 0) > 0 ||
        state.current.expanded.length ||
        state.current.selected.length
      ) {
        setUpdates(true);
        void count();
      } else await refresh();
    }
    function poll() {
      if (document.hidden || busyRef.current || state.current.loading) return;
      if (
        (viewport.current?.scrollTop ?? 0) > 0 ||
        state.current.expanded.length ||
        state.current.selected.length
      )
        void count(true);
      else void refresh();
    }
    const timer = setInterval(poll, 30000);
    window.addEventListener('cinch-msg-changed', changed);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cinch-msg-changed', changed);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh, count]);
  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Reset the request state before starting this external query.
    setSuggestions([]);
    if (!draft.trim()) {
      setSuggesting(false);
      return;
    }
    setSuggesting(true);
    const timer = setTimeout(
      () =>
        msgApi
          .list(false, { f: 'title', p: 1, s: 8, q: draft.trim() })
          .then((data) => {
            if (active) setSuggestions([...new Set(data.items.map((row) => row.title))]);
          })
          .catch(() => {})
          .finally(() => {
            if (active) setSuggesting(false);
          }),
      250
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft, identity]);
  function search(value = draft) {
    clearTimeout(searchTimer.current);
    if (busyRef.current) return;
    const next = value.trim();
    if (next) setHistory((old) => [next, ...old.filter((value) => value !== next)].slice(0, 8));
    setQuery(next);
  }
  function changeDraft(value: string) {
    setDraft(value);
    if (!value.trim()) search('');
  }
  function scheduleSearch() {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => search(), 300);
  }
  function cancelSearch() {
    clearTimeout(searchTimer.current);
  }
  async function mutate(action: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    generation.current++;
    setLoadingMore(false);
    try {
      await action();
    } catch {
      setError(true);
    } finally {
      msgChanged();
      if (mounted.current) await refresh();
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function toggle(row: Msg) {
    if (!can('view-detail') || busyRef.current || state.current.loading || detailLoading !== undefined) return;
    if (state.current.expanded.includes(row.id)) {
      setExpanded((old) => old.filter((id) => id !== row.id));
      if (filter === 'unread' && row.read_at) void refresh();
      return;
    }
    const run = ++detailRun.current;
    setDetailLoading(row.id);
    setDetailError(undefined);
    busyRef.current = true;
    setBusy(true);
    generation.current++;
    setLoadingMore(false);
    try {
      const value = await msgApi.get(row.id, false);
      if (!mounted.current || run !== detailRun.current) return;
      if (!value.read_at && can('mark-read')) {
        await msgApi.read(row.id);
        value.read_at = Date.now();
        needsRebase.current = filter === 'unread';
      }
      if (!mounted.current || run !== detailRun.current) return;
      setRows((old) => old.map((item) => (item.id === row.id ? { ...item, ...value } : item)));
      setExpanded((old) => [...new Set([...old, row.id])]);
      msgChanged();
      void count();
    } catch {
      if (mounted.current && run === detailRun.current) setDetailError(row.id);
    } finally {
      if (mounted.current && run === detailRun.current) setDetailLoading(undefined);
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function bulk(read: boolean, ids: number[], selected = false) {
    if (!can(read ? 'mark-selected-read' : selected ? 'delete-selected' : 'delete')) return;
    await mutate(async () => {
      for (const id of ids) {
        if (read) await msgApi.read(id);
        else await msgApi.remove(id, false);
        setSelected((old) => old.filter((value) => value !== id));
      }
    });
  }
  return {
    rows,
    total,
    unread,
    filter,
    setFilter,
    draft,
    setDraft: changeDraft,
    query,
    loading,
    loadingMore,
    error,
    moreError,
    busy,
    expanded,
    detailLoading,
    detailError,
    selected,
    setSelected,
    selecting,
    setSelecting,
    updates,
    history,
    suggestions,
    suggesting,
    hasMore: rows.length < total,
    refresh,
    more,
    search,
    scheduleSearch,
    cancelSearch,
    toggle,
    readAll: () => can('read-all') ? mutate(() => msgApi.readAll()) : Promise.resolve(),
    mark: (id: number) => can('mark-read') ? mutate(() => msgApi.read(id)) : Promise.resolve(),
    bulk
  };
}

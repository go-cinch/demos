'use client';
import { useDefaultPageSize } from '@/features/admin/page-size';
import { messageAttention, visitMessages } from './message-attention';
import { useAuth } from '@/features/auth/auth-context';
import { messagePermissions } from './permissions';
import { useQueryClient } from '@tanstack/react-query';
import { messageListOptions, unreadCountOptions } from './api/queries';
import { useCallback, useEffect, useRef, useState } from 'react';
import { msgApi, msgChanged, msgPreviewFields, type Msg } from './api/service';
export function useMessages(sent: boolean, readable: boolean, fields = msgPreviewFields, fixedSize?: number) {
  const defaultSize = useDefaultPageSize();
  const user = useAuth().user;
  const permissions = messagePermissions(user);
  const attentionUser = user?.id;
  useEffect(() => {
    if (!sent && readable) visitMessages(attentionUser);
  }, [sent, readable, attentionUser]);

  const queryClient = useQueryClient();
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState<Msg[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [size, setSize] = useState(fixedSize ?? defaultSize);
  useEffect(() => {
    setSize(fixedSize ?? defaultSize);
    setPage(1);
  }, [defaultSize, fixedSize]);

  const [type, setType] = useState(''),
    [status, setStatus] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(false),
    [selected, setSelected] = useState<Msg | null>(null),
    [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState(false);
  const [confirmation, setConfirmation] = useState<
    'delete' | 'clear' | 'deleteSelected' | 'readSelected' | ''
  >('');
  const [clearIDs, setClearIDs] = useState<number[]>([]);
  const generation = useRef(0),
    detailGeneration = useRef(0),
    mounted = useRef(true),
    sending = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!readable || !attentionUser) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await queryClient.fetchQuery(
        messageListOptions(
          sent,
          {
            p: page,
            s: size,
            f: fields,
            ...(type ? { type } : {}),
            ...(query ? { q: query } : {}),
            ...(scope ? { scope } : {}),
            ...(!sent && status ? { read: status === 'read' } : {})
          },
          attentionUser
        )
      );
      if (current !== generation.current || !mounted.current) return;
      if (!result.items.length && page > 1 && result.t <= (page - 1) * size) {
        setPage((p) => p - 1);
        return;
      }
      setNow(Date.now());
      setRows(result.items);
      setTotal(result.t);
    } catch (e) {
      if (current === generation.current && mounted.current) {
        setError((e as Error).message);
        setRows([]);
      }
    } finally {
      if (current === generation.current && mounted.current) setLoading(false);
    }
  }, [sent, readable, page, size, type, status, query, scope, queryClient, attentionUser, fields]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- invalidate the current request counter on disposal
      generation.current++;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- invalidate the current detail request counter on disposal
      detailGeneration.current++;
    };
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !sending.current) void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('cinch-msg-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cinch-msg-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);
  async function openDetail(row: Msg) {
    if (!readable) return;
    const current = ++detailGeneration.current;
    setDetail(true);
    setSelected(null);
    setDetailLoading(true);
    try {
      const value = await msgApi.get(row.id, sent);
      if (current !== detailGeneration.current || !mounted.current) return;
      setSelected(value);
      if (!sent && !value.read_at && permissions.control(false, 'mark-read')) {
        await msgApi.read(value.id);
        setSelected({ ...value, read_at: Date.now() });
        msgChanged();
        await load();
      }
    } catch (e) {
      if (mounted.current) {
        setDetail(false);
        setError((e as Error).message);
      }
    } finally {
      if (current === detailGeneration.current && mounted.current) setDetailLoading(false);
    }
  }
  const closeDetail = () => {
    detailGeneration.current++;
    setDetail(false);
  };
  async function mark(row: Msg) {
    if (sending.current || !permissions.control(false, 'mark-read')) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await msgApi.read(row.id);
      msgChanged();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function newMessage() {
    if (!sent || !permissions.send) return;
    setCompose(true);
  }
  async function readAll() {
    if (sending.current || sent || !permissions.control(false, 'read-all')) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await msgApi.readAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      msgChanged();
      await load();
      sending.current = false;
      setBusy(false);
    }
  }
  const [pendingIDs, setPendingIDs] = useState<number[]>([]);
  const pendingSent = useRef(sent);
  function requestBulk(ids: number[], action: 'deleteSelected' | 'readSelected') {
    if (sending.current || !ids.length || (sent && action === 'readSelected') || !permissions.control(sent, action === 'readSelected' ? 'mark-selected-read' : 'delete-selected')) return;
    pendingSent.current = sent;
    setPendingIDs([...new Set(ids)]);
    setConfirmation(action);
  }
  async function confirm() {
    const control = confirmation === 'readSelected' ? 'mark-selected-read' : confirmation === 'deleteSelected' || confirmation === 'clear' ? 'delete-selected' : 'delete';
    if (sending.current || !permissions.control(pendingSent.current, control)) return false;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (confirmation === 'deleteSelected' || confirmation === 'readSelected') {
        for (const id of pendingIDs) {
          if (confirmation === 'readSelected') await msgApi.read(id);
          else await msgApi.remove(id, pendingSent.current);
          setPendingIDs((ids) => ids.filter((value) => value !== id));
        }
      } else if (confirmation === 'clear') {
        for (const id of clearIDs) await msgApi.remove(id, false);
      } else if (selected) await msgApi.remove(selected.id, sent);
      setConfirmation('');
      closeDetail();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      msgChanged();
      await load();
      sending.current = false;
      setBusy(false);
    }
  }

  return {
    now,
    query,
    setQuery: (value: string) => {
      setPage(1);
      setQuery(value);
    },
    scope,
    setScope: (value: string) => {
      setPage(1);
      setScope(value);
    },
    rows,
    total,
    page,
    setPage,
    size,
    setSize,
    type,
    status,
    setType: (v: string) => {
      setPage(1);
      setType(v);
    },
    setStatus: (v: string) => {
      setPage(1);
      setStatus(v);
    },
    loading,
    error,
    busy,
    load,
    detail,
    closeDetail,
    selected,
    detailLoading,
    openDetail,
    mark,
    compose,
    setCompose,
    newMessage,
    clearCount: clearIDs.length,
    clearPreview: () => {
      if (!permissions.control(false, 'delete-selected')) return;
      pendingSent.current = false;
      setClearIDs(rows.map((row) => row.id));
      setConfirmation('clear');
    },
    readAll,
    requestBulk,
    confirmation,
    setConfirmation,
    confirm,
    remove: (row: Msg) => {
      if (!permissions.control(sent, 'delete')) return;
      pendingSent.current = sent;
      setSelected(row);
      setConfirmation('delete');
    }
  };
}
export function useUnreadCount() {
  const attentionUser = useAuth().user?.id;
  const queryClient = useQueryClient();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let disposed = false,
      busy = false,
      queued = false;
    async function refresh() {
      if (disposed || document.hidden) return;
      if (busy) {
        queued = true;
        return;
      }
      busy = true;
      try {
        const result = await queryClient.fetchQuery(unreadCountOptions(attentionUser));
        if (!disposed && result.user_id === attentionUser) {
          messageAttention.update(result);
          setCount(messageAttention.count(attentionUser));
        }
      } catch {
        if (!disposed) setCount(null);
      } finally {
        busy = false;
        if (queued && !disposed) {
          queued = false;
          void refresh();
        }
      }
    }
    const syncSeen = () => setCount(messageAttention.count(attentionUser));
    window.addEventListener('cinch-msg-seen', syncSeen);
    window.addEventListener('storage', syncSeen);
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('cinch-msg-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('cinch-msg-seen', syncSeen);
      window.removeEventListener('storage', syncSeen);
      clearInterval(timer);
      window.removeEventListener('cinch-msg-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [queryClient, attentionUser]);
  return count;
}

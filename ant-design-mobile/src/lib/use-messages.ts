import { useCallback, useEffect, useRef, useState } from "react";
import { msgApi, msgChanged, type Msg, type MsgInput } from "./msg";
import { useMessageFeed } from "./use-message-feed";
const emptyDraft = (): MsgInput => ({
  title: "",
  content: "",
  type: "notice",
  scope: "all",
  recipient_ids: [],
  expired_at: null,
});
export function useMessages(
  sent: boolean,
  readable: boolean,
  tr: (key: string) => string,
  parseExpiry: (value: string) => number,
  infinite = false,
) {
  const [rows, setRows] = useState<Msg[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [size, setSize] = useState(20);
  const [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(readable),
    [error, setPageError] = useState(""),
    [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(false),
    [selected, setSelected] = useState<Msg | null>(null),
    [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState(false),
    [draft, setDraft] = useState<MsgInput>(emptyDraft),
    [expiry, setExpiry] = useState(""),
    [attempted, setAttempted] = useState(false),
    [sendError, setSendError] = useState("");
  const [confirmation, setConfirmation] = useState<
    "delete" | "deleteSelected" | "readSelected" | ""
  >("");
  const generation = useRef(0),
    detailGeneration = useRef(0),
    mounted = useRef(true),
    sending = useRef(false),
    key = useRef(""),
    lastPayload = useRef("");
  const feed = useMessageFeed(infinite && readable && !sent, type, size);
  const setError = infinite ? feed.setError : setPageError;
  const loadPage = useCallback(async () => {
    const current = ++generation.current;
    if (!readable) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setPageError("");
    try {
      const result = await msgApi.list(sent, {
        p: page,
        s: size,
        ...(type ? { type } : {}),
        ...(!sent && status ? { read: status === "read" } : {}),
      });
      if (current !== generation.current || !mounted.current) return;
      if (!result.items.length && page > 1 && result.t <= (page - 1) * size) {
        setPage((p) => p - 1);
        return;
      }
      setRows(result.items);
      setTotal(result.t);
    } catch (e) {
      if (current === generation.current && mounted.current) {
        setPageError((e as Error).message);
        setRows([]);
      }
    } finally {
      if (current === generation.current && mounted.current) setLoading(false);
    }
  }, [sent, readable, page, size, type, status]);
  const load = infinite ? feed.load : loadPage;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      detailGeneration.current++;
    };
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !sending.current) void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("cinch-msg-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("cinch-msg-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const issues = {
    title:
      !draft.title.trim() || [...draft.title.trim()].length > 200
        ? tr("titleError")
        : "",
    content:
      !draft.content.trim() || [...draft.content.trim()].length > 20000
        ? tr("contentError")
        : "",
    recipients:
      draft.scope === "targeted" &&
      (!draft.recipient_ids?.length || draft.recipient_ids.length > 1000)
        ? tr("recipientError")
        : "",
    expiry:
      expiry &&
      (!Number.isFinite(parseExpiry(expiry)) ||
        parseExpiry(expiry) <= Date.now())
        ? tr("expiryError")
        : "",
  };
  async function openDetail(row: Msg) {
    const current = ++detailGeneration.current;
    setDetail(true);
    setSelected(null);
    setDetailLoading(true);
    try {
      const value = await msgApi.get(row.id, sent);
      if (current !== detailGeneration.current || !mounted.current) return;
      setSelected(value);
      if (!sent && !value.read_at) {
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
      if (current === detailGeneration.current && mounted.current)
        setDetailLoading(false);
    }
  }
  const closeDetail = () => {
    detailGeneration.current++;
    setDetail(false);
  };
  async function mark(row: Msg) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
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
    setDraft(emptyDraft());
    setExpiry("");
    setAttempted(false);
    setSendError("");
    key.current = crypto.randomUUID();
    lastPayload.current = "";
    setCompose(true);
  }
  async function send() {
    if (sending.current) return;
    setAttempted(true);
    if (Object.values(issues).some(Boolean)) return;
    sending.current = true;
    setBusy(true);
    setSendError("");
    try {
      const payload = {
        ...draft,
        recipient_ids: draft.scope === "targeted" ? draft.recipient_ids : [],
        expired_at: expiry ? parseExpiry(expiry) : null,
      };
      const serialized = JSON.stringify(payload);
      if (serialized !== lastPayload.current) {
        key.current = crypto.randomUUID();
        lastPayload.current = serialized;
      }
      await msgApi.send(payload, key.current);
      setCompose(false);
      msgChanged();
      if (page !== 1) setPage(1);
      else await load();
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function readAll() {
    if (sending.current || sent) return;
    sending.current = true;
    setBusy(true);
    setError("");
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
  function requestBulk(
    ids: number[],
    action: "deleteSelected" | "readSelected",
  ) {
    if (sending.current || !ids.length || (sent && action === "readSelected"))
      return;
    pendingSent.current = sent;
    setPendingIDs([...new Set(ids)]);
    setConfirmation(action);
  }
  async function confirm() {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      if (
        confirmation === "deleteSelected" ||
        confirmation === "readSelected"
      ) {
        for (const id of pendingIDs) {
          if (confirmation === "readSelected") await msgApi.read(id);
          else await msgApi.remove(id, pendingSent.current);
          setPendingIDs((ids) => ids.filter((value) => value !== id));
        }
      } else if (selected) await msgApi.remove(selected.id, sent);
      setConfirmation("");
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

  const dirty =
    compose &&
    (JSON.stringify(draft) !== JSON.stringify(emptyDraft()) || !!expiry);
  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  return {
    rows: infinite ? feed.rows : rows,
    total: infinite ? feed.total : total,
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
    loading: infinite ? feed.loading : loading,
    error: infinite ? feed.error : error,
    loadingMore: feed.loadingMore,
    moreError: feed.moreError,
    hasMore: feed.hasMore,
    refreshing: feed.refreshing,
    loadMore: feed.loadMore,
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
    draft,
    setDraft,
    expiry,
    setExpiry,
    attempted,
    sendError,
    issues,
    newMessage,
    send,
    dirty,
    readAll,
    requestBulk,
    confirmation,
    setConfirmation,
    confirm,
    remove: (row: Msg) => {
      setSelected(row);
      setConfirmation("delete");
    },
  };
}
export function useUnreadCount() {
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
        const result = await msgApi.count();
        if (!disposed) setCount(result.count);
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
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("cinch-msg-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("cinch-msg-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return count;
}

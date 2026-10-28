"use client";
import { heatmapLayout } from "./heatmap-layout";
import { useDefaultPageSize } from "@/utils/admin/page-size";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAuditList,
  getAuditSummary,
  getAuditDetail,
  exportAudit,
} from "@/utils/admin/service";
import {
  auditRange,
  type AdminQuery,
  type AuditEvent,
  type AuditSummary,
  type HeatCell,
} from "@/utils/admin/model";
export function useAudit(
  kind: "login" | "operation",
  allowed: boolean,
  timezone: string,
  identity: number | undefined,
  initialUsername: string,
  listFields: string,
) {
  const defaultSize = useDefaultPageSize();
  const [days, setDays] = useState(initialUsername ? 30 : 1),
    [end, setEnd] = useState(() => Date.now()),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState(""),
    [result, setResult] = useState(""),
    [module, setModule] = useState(""),
    [sort, setSort] = useState("newest");
  const [exact, setExact] = useState<AdminQuery>(
      initialUsername ? { username: initialUsername } : {},
    ),
    [scope, setScope] = useState<{ from: number; to: number }>(),
    [day, setDay] = useState<HeatCell>(),
    [cell, setCell] = useState<HeatCell>(),
    [heatLevel, setHeatLevel] = useState<"day" | "hour">("day");
  const [overviewKey, setOverviewKey] = useState("");
  const [overview, setOverview] = useState<AuditSummary>(),
    [insight, setInsight] = useState<AuditSummary>(),
    [dayHeat, setDayHeat] = useState<AuditSummary>(),
    [rows, setRows] = useState<AuditEvent[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [size, setSize] = useState(defaultSize);
  useEffect(() => {
    setSize(defaultSize);
    setPage(1);
  }, [defaultSize]);

  const [loading, setLoading] = useState(true),
    [overviewLoading, setOverviewLoading] = useState(true),
    [scopeLoading, setScopeLoading] = useState(false),
    [error, setError] = useState(false),
    [overviewError, setOverviewError] = useState(false),
    [scopeError, setScopeError] = useState(false),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<AuditEvent>(),
    [selectedID, setSelectedID] = useState<number>(),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(false),
    [detailRevision, setDetailRevision] = useState(0);
  const [suggestions, setSuggestions] = useState<AuditEvent[]>([]),
    [suggesting, setSuggesting] = useState(false),
    [history, setHistory] = useState<string[]>([]);
  const snapshot = useRef<AdminQuery | undefined>(undefined),
    searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const global = useMemo(
    () => ({
      ...auditRange(days, end, timezone),
      ...(query ? { q: query } : {}),
      ...(result ? { result } : {}),
      ...(module ? { module } : {}),
      ...exact,
    }),
    [days, end, timezone, query, result, module, exact],
  );
  const criteria = useMemo(
    () => ({ ...global, ...scope, sort }),
    [global, scope, sort],
  );
  useEffect(() => {
    let active = true;
    if (!allowed) return;
    setOverviewLoading(true);
    setOverviewError(false);
    setOverview(undefined);
    getAuditSummary(kind, {
      ...global,
      f:
        kind === "login"
          ? "metrics,trend,heatmap,accounts,sources"
          : "metrics,trend,modules",
    })
      .then((data) => {
        if (active) {
          setOverview(data);
          setOverviewKey(JSON.stringify({ kind, identity, global }));
        }
      })
      .catch(() => {
        if (active) setOverviewError(true);
      })
      .finally(() => {
        if (active) setOverviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, allowed, global, revision, identity]);
  useEffect(() => {
    let active = true;
    if (!allowed) return;
    setLoading(true);
    setError(false);
    snapshot.current = undefined;
    getAuditList(kind, { ...criteria, p: page, s: size, f: listFields })
      .then((data) => {
        if (!active) return;
        setRows(data.items);
        setTotal(data.t);
        snapshot.current = criteria;
        setSelectedID((old) =>
          data.items.some((row) => row.id === old) ? old : undefined,
        );
        if (query)
          setHistory((old) =>
            [query, ...old.filter((value) => value !== query)].slice(0, 6),
          );
      })
      .catch(() => {
        if (active) {
          setError(true);
          setRows([]);
          setTotal(0);
          setSelectedID(undefined);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      snapshot.current = undefined;
    };
  }, [kind, allowed, criteria, page, size, revision, identity, query, listFields]);
  useEffect(() => {
    let active = true;
    setInsight(undefined);
    setScopeError(false);
    if (!allowed || !scope) {
      setScopeLoading(false);
      return;
    }
    setScopeLoading(true);
    getAuditSummary(kind, {
      ...global,
      ...scope,
      f: kind === "login" ? "metrics,heatmap,accounts,sources" : "modules",
    })
      .then((data) => {
        if (active) setInsight(data);
      })
      .catch(() => {
        if (active) setScopeError(true);
      })
      .finally(() => {
        if (active) setScopeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, allowed, global, scope, revision, identity]);
  useEffect(() => {
    let active = true;
    setDayHeat(undefined);
    if (!allowed || kind !== "login" || !day) return;
    getAuditSummary("login", {
      ...global,
      from: day.started_at,
      to: day.ended_at,
      f: "heatmap",
    })
      .then((data) => {
        if (active) setDayHeat(data);
      })
      .catch(() => {
        if (active) setScopeError(true);
      });
    return () => {
      active = false;
    };
  }, [kind, allowed, global, day, revision, identity]);
  useEffect(() => {
    let active = true;
    setSelected(undefined);
    setDetailError(false);
    if (!allowed || !selectedID) {
      setDetailLoading(false);
      return;
    }
    setSelected(rows.find((row) => row.id === selectedID));
    setDetailLoading(true);
    getAuditDetail(kind, selectedID)
      .then((data) => {
        if (active) setSelected(data);
      })
      .catch(() => {
        if (active) setDetailError(true);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
    // Rows are a preview only; a detail request is owned by its selected ID.
  }, [kind, allowed, selectedID, detailRevision, identity]);
  useEffect(() => {
    let active = true;
    setSuggestions([]);
    if (!allowed || !draft.trim()) {
      setSuggesting(false);
      return;
    }
    setSuggesting(true);
    const timer = setTimeout(
      () =>
        getAuditList(kind, {
          ...global,
          q: draft.trim(),
          f: "username,ip,path,trace_id",
          p: 1,
          s: 10,
        })
          .then((data) => {
            if (active) setSuggestions(data.items);
          })
          .catch(() => {
            if (active) setSuggestions([]);
          })
          .finally(() => {
            if (active) setSuggesting(false);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, allowed, draft, global, identity]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const initial = useRef(identity);
  useEffect(() => {
    if (initial.current === identity) return;
    initial.current = identity;
    setQuery("");
    setDraft("");
    setExact({});
    setScope(undefined);
    setDay(undefined);
    setCell(undefined);
    setSelectedID(undefined);
    setHistory([]);
    setSuggestions([]);
  }, [identity]);
  useEffect(() => {
    setScope(undefined);
    setCell(undefined);
    setDay(undefined);
    setPage(1);
  }, [timezone, days]);
  function search(value = draft) {
    clearTimeout(searchTimer.current);
    setQuery(value.trim());
    setPage(1);
    setSelectedID(undefined);
  }
  function searchSoon() {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => search(), 300);
  }
  function clearScope() {
    setScope(undefined);
    setDay(undefined);
    setCell(undefined);
    setHeatLevel("day");
    setPage(1);
    setSelectedID(undefined);
  }
  function selectInterval(from: number, to: number) {
    const start = Math.max(from, Number(global.from)),
      finish = Math.min(to, Number(global.to));
    if (finish <= start) return;
    setScope({ from: start, to: finish });
    setCell(undefined);
    setPage(1);
    setSelectedID(undefined);
  }
  function selectCell(value: HeatCell, toggle = true) {
    const same =
      toggle &&
      cell?.started_at === value.started_at &&
      cell?.ended_at === value.ended_at;
    if (same) {
      clearScope();
      return;
    }
    if (days === 30 && heatLevel === "day") {
      setDay(value);
      setHeatLevel("day");
    }
    setCell(value);
    setScope({ from: value.started_at, to: value.ended_at });
    setPage(1);
    setSelectedID(undefined);
  }
  function related(
    field: "username" | "ip" | "path",
    value: string,
    toggle = true,
  ) {
    setExact((old) => {
      const next = { ...old };
      if (toggle && next[field] === value) delete next[field];
      else next[field] = value;
      return next;
    });
    setDraft("");
    setQuery("");
    setPage(1);
    setSelectedID(undefined);
  }
  function reset() {
    setQuery("");
    setDraft("");
    setExact({});
    setResult("");
    setModule("");
    setSort("newest");
    clearScope();
  }
  function refresh() {
    setEnd(Date.now());
    setRevision((value) => value + 1);
  }
  async function download() {
    if (!snapshot.current || loading) return;
    return exportAudit(kind, snapshot.current);
  }
  const heatCells = useMemo(() => {
    if (heatLevel !== "hour" || !day) return overviewLoading || (!overview && !overviewError) ? heatmapLayout(Number(global.from), Number(global.to), timezone) : overview?.heatmap ?? [];
    return Array.from({ length: 24 }, (_, hour) => {
      const matches =
        dayHeat?.heatmap?.filter((cell) => cell.hour === hour) ?? [];
      return {
        started_at: matches[0]?.started_at ?? day.started_at,
        ended_at: matches.at(-1)?.ended_at ?? day.started_at,
        hour,
        weekday: day.weekday,
        count: matches.reduce((sum, cell) => sum + cell.count, 0),
        failed: matches.reduce((sum, cell) => sum + cell.failed, 0),
      };
    });
  }, [overview, heatLevel, day, dayHeat, overviewLoading, overviewError, global.from, global.to, timezone]);
  return {
    days,
    setDays,
    draft,
    setDraft,
    result,
    setResult,
    module,
    setModule,
    sort,
    setSort,
    exact,
    setExact,
    scope,
    day,
    cell,
    heatLevel,
    setHeatLevel,
    overview,
    insight,
    heatCells,
    rows,
    total,
    page,
    setPage,
    size,
    setSize,
    loading,
    overviewLoading:
      overviewLoading ||
      overviewKey !== JSON.stringify({ kind, identity, global }),
    scopeLoading,
    error,
    overviewError,
    scopeError,
    selected,
    selectedID,
    setSelectedID,
    detailLoading,
    detailError,
    retryDetail: () => setDetailRevision((value) => value + 1),
    suggestions,
    suggesting,
    history,
    search,
    searchSoon,
    clearScope,
    selectInterval,
    selectCell,
    related,
    reset,
    refresh,
    download,
  };
}

"use client";
import { useEffect, useRef, useState } from "react";
import { msgApi } from "@/api/msg";
import { useAdminText } from "@/pages/System/admin-ui";
export default function MessageSearch({
  value,
  onSearch,
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
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    let active = true;
    setSuggestions([]);
    if (!draft.trim()) return;
    const timeout = setTimeout(
      () =>
        msgApi
          .list(true, { q: draft.trim(), f: "title", p: 1, s: 8 })
          .then((data) => {
            if (active)
              setSuggestions([...new Set(data.items.map((row) => row.title))]);
          })
          .catch(() => {}),
      200,
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
    if (next)
      setHistory((old) =>
        [next, ...old.filter((value) => value !== next)].slice(0, 8),
      );
    onSearch(next);
  }
  return (
    <div className="relative min-w-60 flex-1">
      <label className="mb-2 block text-sm">{text("msg.keyword")}</label>
      <input
        aria-label={text("msg.searchMessages")}
        placeholder={text("msg.searchMessages")}
        className="w-full rounded-lg border bg-transparent p-2.5 text-sm"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value.trim()) search("");
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
          if (event.key === "Enter") {
            event.preventDefault();
            search();
          }
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white p-2 shadow-lg dark:bg-gray-900">
          {[...new Set([...history, ...suggestions])]
            .filter((value) =>
              value.toLocaleLowerCase().includes(draft.toLocaleLowerCase()),
            )
            .map((value) => (
              <button
                type="button"
                key={value}
                className="block w-full p-2 text-start text-sm break-words hover:bg-gray-100 dark:bg-gray-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => search(value)}
              >
                {value}
                {history.includes(value) && (
                  <span className="ms-2 text-xs opacity-60">
                    {text("msg.searchHistory")}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AButton,
  AdminDrawer,
  useAdminText,
  mutedClass,
} from "./admin-ui";
import { associationOptions } from "@/utils/admin/service";
import { type AdminRecord, recordName } from "@/utils/admin/model";
import { msgApi } from "@/api/msg";
export default function AssociationEditor({
  resource,
  kind,
  value,
  onChange,
  seed = [],
  excludeGroup,
}: {
  resource: "action" | "user";
  kind?: "recipient";
  value: Array<string | number>;
  onChange: (value: Array<string | number>) => void;
  seed?: AdminRecord[];
  excludeGroup?: number;
}) {
  const text = useAdminText();
  const auth = useAuth();
  const canBrowse = kind === "recipient" ? auth.canButton("system.msg.send") : auth.canMenu(`/system/${resource}`);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [chosen, setChosen] = useState<Array<string | number>>([]);
  const [removed, setRemoved] = useState<Array<string | number>>([]);
  const [cached, setCached] = useState<Map<string, AdminRecord>>(
    () => new Map(),
  );
  const cache = useMemo(
    () =>
      new Map([
        ...cached,
        ...seed.map(
          (record) =>
            [
              String(resource === "action" ? record.code : record.id),
              record,
            ] as const,
        ),
      ]),
    [cached, seed, resource],
  );
  const key = (record: AdminRecord) =>
    resource === "action" ? String(record.code) : record.id;
  const loadOptions = useCallback(async () => {
    if (kind === "recipient") {
      const users = await msgApi.users(query.trim());
      return {
        items: users
          .slice((page - 1) * 20, page * 20)
          .map((user): AdminRecord => ({ ...user })),
        p: page,
        s: 20,
        t: users.length,
      };
    }
    return associationOptions(resource, {
      p: page,
      s: 20,
      q: query.trim(),
      ...(excludeGroup ? { exclude_user_group_id: excludeGroup } : {}),
    });
  }, [kind, query, page, resource, excludeGroup]);
  useEffect(() => {
    let active = true;
    if (!open || !canBrowse) return;
    setLoading(true);
    setError(false);
    const timer = setTimeout(
      () =>
        loadOptions()
          .then((result) => {
            if (active) {
              setCached(
                (current) =>
                  new Map([
                    ...current,
                    ...result.items.map(
                      (record) =>
                        [
                          String(
                            resource === "action" ? record.code : record.id,
                          ),
                          record,
                        ] as const,
                    ),
                  ]),
              );
              setOptions((current) =>
                page === 1
                  ? result.items
                  : [
                      ...new Map(
                        [...current, ...result.items].map((row) => [
                          row.id,
                          row,
                        ]),
                      ).values(),
                    ],
              );
              setTotal(result.t);
            }
          })
          .catch(() => {
            if (active) setError(true);
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, loadOptions, retry, canBrowse, page, resource]);
  const entity = text(
    kind === "recipient"
      ? "system-editor.associations.recipient"
      : resource === "action"
        ? "system-editor.associations.action"
        : "system-editor.associations.user",
  );
  function label(id: string | number) {
    const record = cache.get(String(id));
    return record
      ? kind === "recipient"
        ? recordName(record)
        : `${recordName(record)} · ${String(record.word ?? record.code ?? "")}`
      : String(id);
  }
  return (
    <div data-testid="association-editor" className="space-y-3">
      <div className="space-y-2">
        {value.map((id) => (
          <div
            key={id}
            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <span className="min-w-0 break-words">{label(id)}</span>
            <AButton
              onClick={() => {
                setRemoved((old) => [...new Set([...old, id])]);
                onChange(value.filter((item) => item !== id));
              }}
            >
              {text("system-editor.removeItem", { name: label(id) })}
            </AButton>
          </div>
        ))}
      </div>
      {removed
        .filter((id) => !value.includes(id))
        .map((id) => (
          <div key={id} className="flex justify-between gap-2 text-sm">
            <span className={mutedClass}>
              {text("system-editor.removedItem", { name: label(id) })}
            </span>
            <AButton onClick={() => onChange([...value, id])}>
              {text("system-editor.undo")}
            </AButton>
          </div>
        ))}
      <AButton
        disabled={!canBrowse}
        onClick={() => {
          setChosen([]);
          setQuery("");
          setPage(1);
          setOpen(true);
        }}
      >
        {text("system-editor.addItem", { entity })}
      </AButton>
      <AdminDrawer
        open={open}
        title={text("system-editor.chooseExisting", { entity })}
        onClose={() => setOpen(false)}
        footer={
          <AButton
            active
            disabled={!chosen.length}
            onClick={() => {
              onChange([...new Set([...value, ...chosen])]);
              setOpen(false);
            }}
          >
            {text("system-editor.addSelected", { count: chosen.length })}
          </AButton>
        }
      >
        <input
          className="mb-4 w-full rounded-lg border bg-transparent p-3"
          aria-label={text(
            kind === "recipient"
              ? "system-editor.searchRecipient"
              : resource === "action"
                ? "system-editor.searchPermission"
                : "system-editor.searchMember",
          )}
          placeholder={text(
            kind === "recipient"
              ? "system-editor.searchRecipient"
              : resource === "action"
                ? "system-editor.searchPermission"
                : "system-editor.searchMember",
          )}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            setOptions([]);
          }}
        />
        {error && (
          <div role="alert">
            {text("system-cards.loadError")}
            <AButton onClick={() => setRetry((value) => value + 1)}>
              {text("system-cards.retry")}
            </AButton>
          </div>
        )}
        <div aria-busy={loading} className="space-y-2">
          {options.map((option) => {
            const id = key(option);
            const added = value.includes(id);
            return (
              <button
                type="button"
                key={id}
                disabled={added}
                aria-pressed={added || chosen.includes(id)}
                className="w-full rounded-lg border border-gray-200 p-4 text-start disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-current dark:border-gray-700"
                onClick={() =>
                  setChosen((old) =>
                    old.includes(id)
                      ? old.filter((item) => item !== id)
                      : [...old, id],
                  )
                }
              >
                <strong>{recordName(option)}</strong>
                <span className="font-mono ms-2 text-xs">
                  {String(option.word ?? option.code ?? "")}
                </span>
                {added && (
                  <span className="ms-2 text-xs">
                    {text("system-editor.alreadyAdded")}
                  </span>
                )}
                {resource === "action" &&
                  String(option.resource ?? "").includes("*") && (
                    <p className="text-amber-600">
                      {text("system-editor.highRiskPermission")}
                    </p>
                  )}
              </button>
            );
          })}
        </div>
        {!loading && !options.length && (
          <p>{text("system-editor.noMatches")}</p>
        )}
        {options.length < total && (
          <div className="mt-4">
            <AButton
              disabled={loading}
              onClick={() => setPage((value) => value + 1)}
            >
              {text("system-editor.loadMore")}
            </AButton>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}

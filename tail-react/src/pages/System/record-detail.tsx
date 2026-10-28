"use client";
import PermissionEditor from "./PermissionEditor";
import { type ActionConfig, type UserPermissionSource } from "@/api/system";
import { useTranslation } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import {
  AButton,
  AdminDrawer,
  useAdminText,
  useAdminTimezone,
  mutedClass,
} from "./admin-ui";
import { getAdminRecord, getGroupMembers } from "@/utils/admin/service";
import {
  type AdminRecord,
  type AdminResource,
  recordName,
  countMembers,
  permissionRecords,
  adminDate,
} from "@/utils/admin/model";
export default function RecordDetail({
  resource,
  record,
  onClose,
  onEdit,
  renderValue,
  canViewMembers = true,
}: {
  resource: AdminResource;
  canViewMembers?: boolean;
  record?: AdminRecord;
  onClose: () => void;
  onEdit?: (record: AdminRecord) => void;
  renderValue: (key: string, value: unknown, record: AdminRecord) => ReactNode;
}) {
  const text = useAdminText();
  const timezone = useAdminTimezone();
  const [data, setData] = useState<AdminRecord>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(record);
    if (!record) return;
    setLoading(true);
    setError(false);
    getAdminRecord(resource, record.id)
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [record, resource, retry]);
  return (
    <AdminDrawer
      open={!!record}
      title={text("system-cards.recordDetails")}
      onClose={onClose}
      footer={
        <>
          <AButton onClick={onClose}>{text("system-cards.backToList")}</AButton>
          {data && onEdit && (
            <AButton active onClick={() => onEdit(data)}>
              {text("system.common.edit")}
            </AButton>
          )}
        </>
      }
    >
      {loading ? (
        <div
          aria-busy="true"
          className="h-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      ) : error ? (
        <div role="alert">
          {text("system-cards.loadError")}
          <AButton onClick={() => setRetry((value) => value + 1)}>
            {text("system-cards.retry")}
          </AButton>
        </div>
      ) : (
        data && (
          <div className="space-y-5" data-testid="record-detail">
            <div>
              <h3 className="text-xl font-semibold">{recordName(data)}</h3>
              <span className={mutedClass}>#{data.id}</span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(data)
                .filter(
                  ([key]) =>
                    ![
                      "id",
                      "actions",
                      "action_codes",
                      "users",
                      "member_count",
                      "member_preview",
                      "permission_sources",
                      "config",
                      "names",
                    ].includes(key),
                )
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="min-w-0 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <dt className={mutedClass}>{text(fieldKey(key))}</dt>
                    <dd className="mt-2 break-words">
                      {key.endsWith("_at") ? (
                        adminDate(value, timezone)
                      ) : ["value", "metadata"].includes(key) ? (
                        <pre
                          tabIndex={0}
                          className="max-h-64 overflow-auto rounded border p-3 text-xs break-words whitespace-pre-wrap"
                        >
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : (
                        renderValue(key, value, data)
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
            {resource === "action" && <PermissionEditor key={`action-${data.id}`} readOnly definition config={data.config as ActionConfig} onChange={() => {}} />}
            {["role", "user", "user-group"].includes(resource) && (
              <PermissionPreview record={data} />
            )}
            {resource === "user-group" && canViewMembers && (
              <MemberList id={data.id} count={countMembers(data)} />
            )}
            <details>
              <summary className="cursor-pointer">
                {text("system-cards.rawRecord")}
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded border border-gray-200 p-3 text-xs break-words whitespace-pre-wrap dark:border-gray-700">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </div>
        )
      )}
    </AdminDrawer>
  );
}
const fields: Record<string, string> = {
  username: "username",
  code: "code",
  name: "name",
  word: "word",
  group: "group",
  key: "dictionaryKey",
  value: "dictionaryValue",
  enabled: "enabled",
  description: "description",
  resource: "resourceRules",
  menu: "menuPaths",
  button: "buttonPermission",
  status: "status",
  metadata: "metadata",
  created_at: "createdAt",
  updated_at: "updatedAt",
  role: "role",
  role_id: "role",
};
function fieldKey(key: string) {
  return key === "login_count"
    ? "system-cards.loginCount"
    : key === "last_logged_in_at"
      ? "system-cards.lastLogin"
      : key === "wrong"
        ? "system-cards.failedLoginCount"
        : `system.fields.${fields[key] ?? key}`;
}
export function PermissionPreview({ record }: { record: AdminRecord }) {
  const { t } = useTranslation();
  const [source, setSource] = useState('merged');
  const sources = Array.isArray(record.permission_sources) ? record.permission_sources as UserPermissionSource[] : [];
  const actions = permissionRecords(record);
  const visibleSources = sources.filter(item => source === 'merged' || item.kind === source);
  const codes = sources.length ? visibleSources.flatMap(item => item.action_codes ?? []) : (Array.isArray(record.action_codes) ? record.action_codes as string[] : []);
  const chosen = source === 'merged' ? (sources.length ? sources.flatMap(source => source.actions ?? []) : actions) : (source === 'direct' && !sources.length ? actions : sources.filter(item => item.kind === source).flatMap(source => source.actions ?? []));
  return <section className="space-y-4" aria-label={t('catalogUI.details')}>
    <h3 className="font-semibold">{t('catalogUI.details')}</h3>
    {(sources.length > 0 || 'username' in record) && <div className="flex flex-wrap gap-2">{['direct','role','group','merged'].map(key => <AButton key={key} active={source === key} onClick={() => setSource(key)}>{t(`catalogUI.${key}`)}</AButton>)}</div>}
    {['role','group'].includes(source) && visibleSources.length > 0 && <p className="text-sm text-gray-500 dark:text-gray-400">{visibleSources.map(item => item.name).join(' · ')}</p>}
    <PermissionEditor key={`${record.id}-${source}`} codes={codes} readOnly actions={chosen.map(action => ({code: String(action.code),word:String(action.word),config:action.config as ActionConfig | undefined}))} onChange={() => {}} />
  </section>;
}
export function MemberList({
  id,
  count,
  removed = [],
  onRemove,
}: {
  id: number;
  count: number;
  removed?: number[];
  onRemove?: (member: AdminRecord) => void;
}) {
  const text = useAdminText();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(count);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      getGroupMembers(id, { p: page, s: 20, q: query.trim() })
        .then((value) => {
          if (active) {
            setRows(value.items);
            setTotal(value.t);
          }
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, page, query, retry]);
  return (
    <section
      aria-label={text("system-editor.members")}
      className="space-y-3"
      data-testid="group-members"
    >
      <h3 className="font-semibold">
        {text("system-members.count", { count: total })}
      </h3>
      <input
        className="w-full rounded-lg border bg-transparent p-2"
        aria-label={text("system-editor.searchMember")}
        placeholder={text("system-editor.searchMember")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      {error ? (
        <div role="alert">
          {text("system-cards.loadError")}
          <AButton onClick={() => setRetry((value) => value + 1)}>
            {text("system-cards.retry")}
          </AButton>
        </div>
      ) : (
        <div aria-busy={loading} className="min-h-24 space-y-2">
          {rows.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              <span
                className={
                  removed.includes(member.id) ? "line-through opacity-50" : ""
                }
              >
                {recordName(member)} · {String(member.code ?? "")}
              </span>
              {onRemove && (
                <AButton
                  ariaLabel={text(
                    removed.includes(member.id)
                      ? "system-editor.undo"
                      : "system-editor.removeItem",
                    { name: recordName(member) },
                  )}
                  onClick={() => onRemove(member)}
                >
                  {text(
                    removed.includes(member.id)
                      ? "system-editor.undo"
                      : "system-members.remove",
                  )}
                </AButton>
              )}
            </div>
          ))}
          {!loading && !rows.length && <p>{text("system-cards.noMembers")}</p>}
        </div>
      )}
      <div className="flex justify-between gap-2">
        <AButton
          disabled={loading || page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {text("system.common.previous")}
        </AButton>
        <span>
          {page} / {Math.max(1, Math.ceil(total / 20))}
        </span>
        <AButton
          disabled={loading || page * 20 >= total}
          onClick={() => setPage((value) => value + 1)}
        >
          {text("system.common.next")}
        </AButton>
      </div>
    </section>
  );
}

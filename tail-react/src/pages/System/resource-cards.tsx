"use client";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AButton,
  ACheck,
  useAdminText,
  panelClass,
  mutedClass,
} from "./admin-ui";
import {
  type AdminRecord,
  type AdminResource,
  recordName,
  adminJsonType,
  adminJsonStructure,
  countMembers,
  previewMembers,
  permissionSummaries,
  permissionCount,
  adminDate,
} from "@/utils/admin/model";
export default function ResourceCards({
  resource,
  records,
  loading,
  selected,
  onSelect,
  onDetail,
  onEdit,
  onDelete,
  renderValue,
  canSelectRecord = () => true,
  canEditRecord = () => true,
  canDeleteRecord = () => true,
}: {
  resource: AdminResource;
  records: AdminRecord[];
  loading: boolean;
  selected: number[];
  onSelect: (id: number) => void;
  onDetail?: (record: AdminRecord) => void;
  canSelectRecord?: (record: AdminRecord) => boolean;
  canEditRecord?: (record: AdminRecord) => boolean;
  canDeleteRecord?: (record: AdminRecord) => boolean;
  onEdit?: (record: AdminRecord) => void;
  onDelete?: (id: number) => void;
  renderValue: (key: string, value: unknown, record: AdminRecord) => ReactNode;
}) {
  const text = useAdminText();
  const { t } = useTranslation();
  const selectable = records.filter(canSelectRecord);
  if (loading)
    return (
      <div
        aria-busy="true"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {[1, 2, 3, 4, 5, 6].map((id) => (
          <div key={id} className={panelClass}>
            <div className="h-5 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="mt-4 h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    );
  if (!records.length)
    return <div className={panelClass}>{text("system-insights.empty")}</div>;
  return (
    <div
      data-testid="resource-cards"
      className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <ACheck
          showLabel
          label={text("system-insights.selectAllPage")}
          checked={
            selectable.length > 0 &&
            selectable.every((record) => selected.includes(record.id))
          }
          disabled={!selectable.length}
          onChange={(checked) => {
            for (const record of selectable)
              if (selected.includes(record.id) !== checked) onSelect(record.id);
          }}
        />
        {selected.length > 0 && (
          <span className="ms-auto text-sm">
            {text("system-insights.selected", { count: selected.length })}
          </span>
        )}
      </div>
      {records.map((record) => (
        <article key={record.id} className={panelClass}>
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 text-start font-semibold break-words hover:underline"
              disabled={!onDetail} onClick={() => onDetail?.(record)}
            >
              {recordName(record)}
            </button>
            <ACheck
              label={text("system-cards.select", {
                name: recordName(record),
              })}
              checked={selected.includes(record.id)}
              disabled={!canSelectRecord(record)}
              onChange={() => { if (canSelectRecord(record)) onSelect(record.id); }}
            />
          </div>
          <p className={mutedClass}>
            {String(
              record.word ?? record.code ?? record.key ?? `#${record.id}`,
            )}
          </p>
          <div className="my-4 min-h-20 space-y-2 text-sm break-words">
            {resource === "dictionary" && (
              <>
                {renderValue("enabled", record.enabled, record)}
                <div className="flex gap-2 text-xs opacity-70">
                  <span className="rounded border px-2 py-1">
                    {text(`system-cards.types.${adminJsonType(record.value)}`)}
                  </span>
                  <span>
                    {text(
                      `system-cards.${adminJsonStructure(record.value).key}`,
                      { count: adminJsonStructure(record.value).count },
                    )}
                  </span>
                </div>
                <pre
                  tabIndex={0}
                  className="max-h-48 overflow-auto rounded border p-3 text-xs break-words whitespace-pre-wrap"
                >
                  {JSON.stringify(record.value, null, 2)}
                </pre>
                <p>
                  {String(
                    record.description || text("system-cards.noDescription"),
                  )}
                </p>
              </>
            )}
            {resource === "whitelist" && (
              <>
                {renderValue("category", record.category, record)}
                {renderValue("resource", record.resource, record)}
              </>
            )}
            {resource === "action" &&
              ["resource", "menu", "button"].map((key) => (
                <div key={key}>{renderValue(key, record[key], record)}</div>
              ))}
            {(resource === "role" ||
              resource === "user" ||
              resource === "user-group") && (
              <>
                <p>
                  {text("system-cards.associatedPermissions")}:{" "}
                  {permissionCount(record)}
                </p>
                <div className="flex flex-wrap items-center gap-1" data-testid="permission-summaries">
                  {permissionSummaries(record).slice(0, 3).map((action) => (
                    <span key={String(action.code)} className="rounded border border-brand-200 px-2 py-1 text-xs text-brand-600 dark:border-brand-500/30 dark:text-brand-300">
                      {String(action.name || t(`actions.${action.code}`, { defaultValue: String(action.code) }))}
                    </span>
                  ))}
                  {permissionCount(record) > 3 && <span className={mutedClass}>+{permissionCount(record) - 3}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    ...new Set(
                      permissionSummaries(record).map((action) =>
                        String(action.group),
                      ),
                    ),
                  ]
                    .slice(0, 4)
                    .map((group) => (
                      <span
                        className="rounded border px-2 py-1 text-xs"
                        key={group}
                      >
                        {group ? String(t(`groups.${group}`, { defaultValue: group })) : text("system-insights.ungrouped")}
                      </span>
                    ))}
                </div>
              </>
            )}
            {resource === "user-group" && (
              <>
                <p>
                  {text("system-members.count", {
                    count: countMembers(record),
                  })}
                </p>
                <div className="flex flex-wrap gap-1">
                  {previewMembers(record)
                    .slice(0, 5)
                    .map((member) => (
                      <span
                        key={member.id}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        {recordName(member)}
                      </span>
                    ))}
                </div>
              </>
            )}
            {resource === "user" && (
              <>
                {renderValue("status", record.status, record)}
                <p>
                  {text("system-cards.loginCount")}:{" "}
                  {Number(record.login_count ?? 0)}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {onDetail && <AButton onClick={() => onDetail(record)}>
              {text("system-cards.details")}
            </AButton>}
            {onEdit && canEditRecord(record) && (
              <AButton onClick={() => onEdit(record)}>
                {text("system.common.edit")}
              </AButton>
            )}
            {onDelete && canDeleteRecord(record) && (
              <AButton danger onClick={() => onDelete(record.id)}>
                {text("system.common.delete")}
              </AButton>
            )}
          </div>
          <p className="mt-3 text-xs opacity-60">
            {adminDate(record.updated_at)}
          </p>
        </article>
      ))}
    </div>
  );
}

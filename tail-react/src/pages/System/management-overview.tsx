"use client";
import { useStatisticsWarning } from "@/utils/admin/statistics-warning";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AButton,
  useAdminText,
  useAdminTimezone,
  panelClass,
  mutedClass,
} from "./admin-ui";
import { getAdminSummary } from "@/utils/admin/service";
import {
  type AdminResource,
  type AdminSummary,
  type AdminQuery,
  type SummaryDay,
} from "@/utils/admin/model";
interface Props {
  resource: AdminResource;
  allowed: boolean;
  refreshKey: number;
  filters: AdminQuery;
  onFilter: (updates: AdminQuery) => void;
  onGroup: (id: number) => void;
}
export default function ManagementOverview({
  resource,
  allowed,
  refreshKey,
  filters,
  onFilter,
  onGroup,
}: Props) {
  const text = useAdminText();
  const { t } = useTranslation();
  const timezone = useAdminTimezone();
  const [days, setDays] = useState(14);
  const [summary, setSummary] = useState<AdminSummary>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const showWarning = useStatisticsWarning(error);
  useEffect(() => {
    let active = true;
    if (!allowed) return;
    setLoading(true);
    setError(false);
    getAdminSummary(
      resource,
      resource === "user" ? { days, time_zone: timezone } : {},
    )
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch(() => {
        if (active) {
          setSummary(undefined);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resource, allowed, refreshKey, days, timezone, retry]);
  if (!allowed) return null;
  const count = (key: string) => summary?.counts[key] ?? 0;
  function metric(
    label: string,
    value: number,
    key?: string,
    filter?: string | number | boolean,
  ) {
    const pressed = key
      ? String(filters[key] ?? "") === String(filter ?? "")
      : false;
    return (
      <button
        type="button"
        key={label}
        disabled={loading || error || !key}
        aria-pressed={key ? pressed : undefined}
        className="min-w-0 rounded-lg border border-gray-200 p-4 text-start transition hover:bg-gray-50 disabled:cursor-default dark:border-gray-700 dark:hover:bg-gray-800"
        onClick={() => key && onFilter({ [key]: pressed ? undefined : filter })}
      >
        <span className={mutedClass}>{label}</span>
        <strong className="mt-2 block text-2xl tabular-nums">
          {loading || error ? "—" : value.toLocaleString()}
        </strong>
      </button>
    );
  }
  function selectDay(day: SummaryDay, login: boolean) {
    const key = login ? "last_logged_in" : "created";
    const same = Number(filters[`${key}_from`]) === day.from;
    onFilter({
      [`${key}_from`]: same ? undefined : day.from,
      [`${key}_to`]: same ? undefined : day.to,
    });
  }
  const groupKey = resource === "role" ? "groups_all" : "groups_exact";
  let selectedGroups: string[] = [];
  try {
    selectedGroups = JSON.parse(String(filters[groupKey] ?? "[]"));
  } catch {
    /* invalid route filters are not selected */
  }
  const maxDay = Math.max(
    1,
    ...(summary?.trend.flatMap((day) => [
      day.count,
      day.recent_logged_in_users,
    ]) ?? []),
  );
  const maxGroup = Math.max(
    1,
    ...(summary?.groups.map((group) => group.count) ?? []),
  );
  return (
    <section
      data-testid="management-overview"
      aria-label={text("system-insights.overview")}
      aria-busy={loading}
      className={panelClass}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{text("system-insights.overview")}</h2>
        {resource === "user" && (
          <div
            role="group"
            aria-label={text("system-insights.period")}
            className="flex gap-2"
          >
            {[14, 30].map((value) => (
              <AButton
                key={value}
                active={days === value}
                onClick={() => setDays(value)}
              >
                {text("system-insights.lastDays", { count: value })}
              </AButton>
            ))}
          </div>
        )}
      </div>
      {showWarning && (
        <div
          role="alert"
          className="mb-3 flex items-center gap-3 rounded-lg border border-amber-500/40 p-3"
        >
          <span>{text("system-insights.overviewError")}</span>
          <AButton onClick={() => setRetry((value) => value + 1)}>
            {text("system-insights.retry")}
          </AButton>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {metric(
          text(
            resource === "user"
              ? "system-insights.userTotal"
              : resource === "role"
                ? "system-insights.roles"
                : resource === "user-group"
                  ? "system-insights.groups"
                  : resource === "action"
                    ? "system-insights.actionTotal"
                    : "system-insights.all",
          ),
          summary?.total ?? 0,
        )}
        {resource === "user" && (
          <>
            {metric(text("system.status.active"), count("active"), "status", 1)}
            {metric(
              text("system.status.pending"),
              count("pending"),
              "status",
              0,
            )}
            {metric(text("system.status.locked"), count("locked"), "status", 2)}
            {metric(
              text("system-insights.recentLoginUsers"),
              count("recent_logged_in_users"),
            )}
          </>
        )}
        {resource === "role" && (
          <>
            {metric(
              text("system-insights.withPermissions"),
              count("with_permissions"),
              "has_permissions",
              true,
            )}
            {metric(
              text("system-insights.withoutPermissions"),
              count("without_permissions"),
              "has_permissions",
              false,
            )}
          </>
        )}
        {resource === "user-group" && (
          <>
            {metric(text("system-insights.memberships"), count("memberships"))}
            {metric(
              text("system-insights.uniqueMembers"),
              count("unique_members"),
            )}
            {metric(
              text("system-insights.withoutMembers"),
              count("empty_groups"),
              "has_members",
              false,
            )}
          </>
        )}
        {resource === "action" && (
          <>
            {metric(
              text("system-insights.businessGroups"),
              summary?.groups.length ?? 0,
            )}
            {["resource", "menu", "button"].map((key) =>
              metric(text(`system-insights.${key}Configured`), count(key)),
            )}
          </>
        )}
        {resource === "dictionary" && (
          <>
            {metric(
              text("system.enabled.yes"),
              count("enabled"),
              "enabled",
              true,
            )}
            {metric(
              text("system.enabled.no"),
              count("disabled"),
              "enabled",
              false,
            )}
          </>
        )}
        {resource === "whitelist" && (
          <>
            {metric(
              text("system.category.permission"),
              count("permission"),
              "category",
              0,
            )}
            {metric("JWT", count("jwt"), "category", 1)}
          </>
        )}
      </div>
      {resource === "user" && (
        <div className="mt-5">
          <h3 className="mb-3 font-medium">
            {text("system-insights.userTrend")}
          </h3>
          <div
            className="flex gap-1 overflow-x-auto pb-3"
            style={{ minHeight: 160 }}
          >
            {(
              summary?.trend ??
              Array.from({ length: days }, (_, i) => ({
                date: String(i),
                count: 0,
                recent_logged_in_users: 0,
                from: 0,
                to: 0,
              }))
            ).map((day) => (
              <div
                className="flex min-w-8 flex-1 flex-col items-center"
                key={day.date}
              >
                <div className="flex h-28 w-full items-end justify-center gap-1">
                  {[false, true].map((login) => (
                    <button
                      key={String(login)}
                      type="button"
                      disabled={loading}
                      aria-pressed={
                        Number(
                          filters[
                            login ? "last_logged_in_from" : "created_from"
                          ],
                        ) === day.from
                      }
                      aria-label={text(
                        login
                          ? "system-insights.recentLoginDay"
                          : "system-insights.newUserDay",
                        {
                          date: day.date,
                          count: login ? day.recent_logged_in_users : day.count,
                        },
                      )}
                      title={text(
                        login
                          ? "system-insights.recentLoginDay"
                          : "system-insights.newUserDay",
                        {
                          date: day.date,
                          count: login ? day.recent_logged_in_users : day.count,
                        },
                      )}
                      className={
                        login
                          ? "w-2 rounded-t bg-emerald-500 focus:ring-2"
                          : "w-2 rounded-t bg-brand-500 focus:ring-2"
                      }
                      style={{
                        height: `${Math.max(3, (100 * (login ? day.recent_logged_in_users : day.count)) / maxDay)}%`,
                      }}
                      onClick={() => selectDay(day, login)}
                    />
                  ))}
                </div>
                <span className="mt-2 text-xs">{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(resource === "role" ||
        resource === "action" ||
        resource === "user-group") && (
        <div className="mt-4 grid max-h-40 gap-2 overflow-y-auto pe-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {(summary?.groups ?? []).map((group) => (
            <button
              key={`${group.id ?? ""}:${group.name}`}
              type="button"
              disabled={loading}
              aria-pressed={
                resource !== "user-group"
                  ? selectedGroups.includes(group.name)
                  : undefined
              }
              className="min-w-0 rounded-lg border border-gray-200 p-2 text-start text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              onClick={() => {
                if (resource === "user-group") {
                  if (group.id) onGroup(group.id);
                  return;
                }
                const next = selectedGroups.includes(group.name)
                  ? selectedGroups.filter((value) => value !== group.name)
                  : [...selectedGroups, group.name];
                onFilter({
                  [groupKey]: next.length ? JSON.stringify(next) : undefined,
                });
              }}
            >
              <span className="flex justify-between gap-3">
                <span>{group.name ? resource === "user-group" ? group.name : String(t(`groups.${group.name}`, { defaultValue: group.name })) : text("system-insights.ungrouped")}</span>
                <strong>{group.count}</strong>
              </span>
              <span className="mt-1 block h-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                <span
                  className="block h-full rounded bg-brand-500"
                  style={{ width: `${(100 * group.count) / maxGroup}%` }}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

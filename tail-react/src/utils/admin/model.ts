export type AdminResource =
  "user" | "role" | "user-group" | "action" | "dictionary" | "whitelist";
export interface AdminRecord {
  id: number;
  [key: string]: unknown;
}
export interface AdminPage<T = AdminRecord> {
  items: T[];
  p: number;
  s: number;
  t: number;
}
export interface SummaryDay {
  date: string;
  from: number;
  to: number;
  count: number;
  recent_logged_in_users: number;
}
export interface SummaryGroup {
  id?: number;
  name: string;
  count: number;
}
export interface AdminSummary {
  total: number;
  counts: Record<string, number>;
  groups: SummaryGroup[];
  trend: SummaryDay[];
}
export const summaryFields: Record<AdminResource, string> = {
  user: "total,counts,trend",
  role: "total,counts,groups",
  "user-group": "total,counts,groups",
  action: "total,counts,groups",
  dictionary: "total,counts",
  whitelist: "total,counts",
};
export const memberFields = "actions,member_count,member_preview";
export type AdminQuery = Record<string, string | number | boolean | undefined>;
export function queryText(params: AdminQuery) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && (value !== "" || key.endsWith("_exact")))
      query.set(key, String(value));
  }
  return query.toString();
}
export function effectiveTimezone(value?: string) {
  return !value || value.toLowerCase() === "local"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : value;
}
export function adminDate(value: unknown, zone?: string) {
  if (typeof value !== "number" || value <= 0 || !Number.isFinite(value))
    return "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTimezone(zone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (name: string) =>
    parts.find((p) => p.type === name)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
// Resolve calendar midnight in the selected IANA zone, including DST boundaries.
export function calendarMidnight(date: string, zone: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const shown = adminDate(instant, zone).replace(" ", "T");
    const delta = target - Date.parse(`${shown}Z`);
    instant += delta;
    if (!delta) break;
  }
  return instant;
}
export function auditRange(days: number, end: number, zone: string) {
  if (days === 1)
    return {
      from: end - 86400000,
      to: end,
      time_zone: effectiveTimezone(zone),
    };
  const localDate = adminDate(end, zone).slice(0, 10);
  const start = new Date(`${localDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    from: calendarMidnight(start.toISOString().slice(0, 10), zone),
    to: end,
    time_zone: effectiveTimezone(zone),
  };
}
export function recordName(record: AdminRecord) {
  return String(
    record.username ?? record.name ?? record.key ?? `#${record.id}`,
  );
}
export function previewMembers(record: AdminRecord): AdminRecord[] {
  return (record.member_preview ?? record.users ?? []) as AdminRecord[];
}
export function countMembers(record: AdminRecord) {
  return Number(
    record.member_count ??
      (Array.isArray(record.users) ? record.users.length : 0),
  );
}
export function permissionSummaries(record: AdminRecord): AdminRecord[] {
  return Array.isArray(record.action_summaries) ? record.action_summaries as AdminRecord[] : permissionRecords(record);
}
export function permissionCount(record: AdminRecord) {
  if (Array.isArray(record.action_summaries) || Array.isArray(record.actions)) return permissionSummaries(record).length;
  return Array.isArray(record.action_codes) ? record.action_codes.length : 0;
}
export function permissionRecords(record: AdminRecord): AdminRecord[] {
  return Array.isArray(record.actions) ? (record.actions as AdminRecord[]) : [];
}
export function changedFields(
  current: Record<string, unknown>,
  initial: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) => !sameAdminValue(value, initial[key]),
    ),
  );
}
export interface AuditEvent extends AdminRecord {
  kind: "login" | "operation";
  user_id: number;
  username: string;
  module: string;
  method: string;
  path: string;
  ip: string;
  user_agent: string;
  trace_id: string;
  error_code: string;
  status: number;
  duration_ms: number;
  occurred_at: number;
  operation: string;
  resource_type: string;
  resource_id: string;
  request_params: unknown;
  response_params: unknown;
}
export interface AuditRank {
  name: string;
  total: number;
  failed: number;
}
export interface HeatCell {
  started_at: number;
  ended_at: number;
  weekday: number;
  hour: number;
  count: number;
  failed: number;
}
export interface AuditSummary {
  from: number;
  to: number;
  bucket_ms?: number;
  heatmap_granularity?: "day" | "hour";
  total?: number;
  success?: number;
  failed?: number;
  unique_users?: number;
  unique_ips?: number;
  average_ms?: number;
  p95_ms?: number;
  success_rate?: number;
  trend?: Array<{ at: number; success: number; failure: number }>;
  heatmap?: HeatCell[];
  modules?: AuditRank[];
  accounts?: AuditRank[];
  sources?: AuditRank[];
  repeated_failures?: AuditRank[];
}

export type AuditKind = "login" | "operation";
export type AuditParams = AdminQuery;
export type AuditHeatCell = HeatCell;

export interface FilterChip {
  key: string;
  label: string;
  clear: AdminQuery;
}
export function adminFilterChips(
  filters: AdminQuery,
  zone: string,
  text: (key: string, params?: Record<string, string | number>) => string,
  groupLabel: (word: string) => string = word => word,
): FilterChip[] {
  const chips: FilterChip[] = [];
  const handled = new Set<string>();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || handled.has(key)) continue;
    if (key === "groups_all" || key === "groups_exact") {
      let names: string[];
      try {
        names = JSON.parse(String(value));
      } catch {
        continue;
      }
      for (const name of names) {
        const remaining = names.filter((item) => item !== name);
        chips.push({
          key: `${key}:${name}`,
          label: text(
            key === "groups_all"
              ? "system-insights.roleGroupFilter"
              : "system-insights.groupFilter",
            { name: name ? groupLabel(name) : text("system-insights.ungrouped") },
          ),
          clear: {
            [key]: remaining.length ? JSON.stringify(remaining) : undefined,
          },
        });
      }
      continue;
    }
    if (key.endsWith("_from") || key.endsWith("_to")) {
      const prefix = key.replace(/_(from|to)$/, "");
      handled.add(`${prefix}_from`);
      handled.add(`${prefix}_to`);
      const date = adminDate(
        Number(filters[`${prefix}_from`] ?? filters[`${prefix}_to`]),
        zone,
      ).slice(0, 10);
      chips.push({
        key: prefix,
        label: text(
          prefix === "last_logged_in"
            ? "system-insights.loginDayFilter"
            : "system-insights.dayFilter",
          { date },
        ),
        clear: { [`${prefix}_from`]: undefined, [`${prefix}_to`]: undefined },
      });
      continue;
    }
    let label: string;
    if (key === "status")
      label = String(value)
        .split(",")
        .map((status) =>
          text(
            `system.status.${status === "1" ? "active" : status === "2" ? "locked" : "pending"}`,
          ),
        )
        .join(", ");
    else if (key === "enabled")
      label = text(
        String(value) === "true" ? "system.enabled.yes" : "system.enabled.no",
      );
    else if (key === "category")
      label = Number(value) === 0 ? text("system.category.permission") : "JWT";
    else if (key === "has_permissions")
      label = text(
        String(value) === "true"
          ? "system-insights.withPermissions"
          : "system-insights.withoutPermissions",
      );
    else if (key === "has_members")
      label = text(
        String(value) === "true"
          ? "system-insights.withMembers"
          : "system-insights.withoutMembers",
      );
    else if (key === "group_exact")
      label = text("system-insights.groupFilter", {
        name: value ? groupLabel(String(value)) : text("system-insights.ungrouped"),
      });
    else {
      const labels: Record<string, string> = {
        username: "username",
        code: "code",
        name: "name",
        word: "word",
        group: "group",
        key: "dictionaryKey",
        resource: "resourceRules",
        menu: "menuPaths",
        button: "buttonPermission",
        action_code: "actionCode",
      };
      label = `${text(labels[key] ? `system.fields.${labels[key]}` : "system.common.search")}: ${value}`;
    }
    chips.push({ key, label, clear: { [key]: undefined } });
  }
  return chips;
}

export function parseAdminDateTime(value: string, zone?: string) {
  const normalized = value.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalized))
    return Number.NaN;
  const exact = normalized.length === 16 ? `${normalized}:00` : normalized,
    target = Date.parse(`${exact}Z`);
  let instant = target;
  for (let index = 0; index < 4; index++) {
    const delta =
      target - Date.parse(`${adminDate(instant, zone).replace(" ", "T")}Z`);
    if (!delta) return instant;
    instant += delta;
  }
  return adminDate(instant, zone).replace(" ", "T") === exact
    ? instant
    : Number.NaN;
}

export function sameAdminValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameAdminValue(value, right[index]))
    );
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const a = left as Record<string, unknown>,
      b = right as Record<string, unknown>;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) => Object.hasOwn(b, key) && sameAdminValue(a[key], b[key]),
      )
    );
  }
  return false;
}

export function adminJsonType(value: unknown) {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}
export function adminJsonStructure(value: unknown) {
  return Array.isArray(value)
    ? { key: "items", count: value.length }
    : value !== null && typeof value === "object"
      ? { key: "fields", count: Object.keys(value).length }
      : typeof value === "string"
        ? { key: "characters", count: [...value].length }
        : { key: "scalar", count: 0 };
}

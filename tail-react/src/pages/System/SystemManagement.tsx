import { ApiError } from "@/api/client";
import {
  createRecord,
  deleteRecords,
  listActionGroups,
  listRecords,
  updateRecord,
  type ResourceKind,
  type SystemRecord,
  type UserRecord,
} from "@/api/system";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Switch from "@/components/form/switch/Switch";
import Checkbox from "@/components/form/input/Checkbox";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import {
  AspectIcon,
  ChevronLeftIcon,
  ListIcon,
  RegenerateIcon,
  SettingsAltIcon,
} from "@/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { isValidUsername, isValidUserPassword } from "@/utils/userValidation";
import { resourceConfigs, type FieldConfig } from "./resourceConfig";
import SearchFilterInput from "./SearchFilterInput";
import SearchableSelect, { type SearchableOption } from "./SearchableSelect";
import SimpleSelect from "./SimpleSelect";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonClass =
  "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition";

function isResource(value?: string): value is ResourceKind {
  return [
    "user",
    "role",
    "user-group",
    "action",
    "dictionary",
    "whitelist",
  ].includes(value || "");
}

function formatDate(value: unknown) {
  if (typeof value !== "number") return "-";
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

function formatDateTimeInput(value: number) {
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export default function SystemManagement() {
  const { resource: resourceParam } = useParams();
  const [searchParams] = useSearchParams();
  const resource: ResourceKind = isResource(resourceParam)
    ? resourceParam
    : "user";
  const config = resourceConfigs[resource];
  const { t } = useTranslation();
  const auth = useAuth();
  const [records, setRecords] = useState<SystemRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SystemRecord | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [initialForm, setInitialForm] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editorOptions, setEditorOptions] = useState<
    Record<string, SearchableOption[]>
  >({});
  const [lockUser, setLockUser] = useState<UserRecord | null>(null);
  const [lockMode, setLockMode] = useState<"until" | "permanent">("until");
  const [lockUntil, setLockUntil] = useState(() =>
    formatDateTimeInput(Date.now() + 86400000),
  );
  const [lockError, setLockError] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [tableDensity, setTableDensity] = useState<
    "compact" | "default" | "loose"
  >("default");
  const [tableSettings, setTableSettings] = useState({
    bordered: true,
    sticky: true,
    striped: true,
  });
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() =>
    config.columns.map((column) => column.key),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const autoSearchTimer = useRef<number | undefined>(undefined);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const can = useCallback(
    (operation: "create" | "read" | "update" | "delete") =>
      auth.canButton(`${config.permission}.${operation}`),
    [auth, config.permission],
  );

  const load = useCallback(async () => {
    if (!can("read")) return;
    setLoading(true);
    setError("");
    try {
      const result = await listRecords(resource, {
        p: page,
        s: pageSize,
        ...filters,
      });
      setRecords(result.items);
      setTotal(result.t);
      setSelected([]);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t("errors.network"),
      );
    } finally {
      setLoading(false);
    }
  }, [can, filters, page, pageSize, resource, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const routeFilters = Object.fromEntries(
      config.filters
        .map((filter) => [filter.key, searchParams.get(filter.key) || ""])
        .filter(([, value]) => value),
    );
    setPage(1);
    setFilters(routeFilters);
    setDraftFilters(routeFilters);
    setRecords([]);
    setSearchExpanded(false);
    setVisibleColumnKeys(config.columns.map((column) => column.key));
  }, [config.columns, config.filters, resource, searchParams]);
  useEffect(() => () => window.clearTimeout(autoSearchTimer.current), []);

  const applySearch = (nextFilters = draftFilters) => {
    window.clearTimeout(autoSearchTimer.current);
    setPage(1);
    setFilters({ ...nextFilters });
  };

  const scheduleSearch = (nextFilters = draftFilters) => {
    window.clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = window.setTimeout(
      () => applySearch(nextFilters),
      500,
    );
  };

  const searchEditorOptions = async (
    field: FieldConfig,
    query: string,
  ): Promise<SearchableOption[]> => {
    if (field.type === "action-group") {
      const result = await listActionGroups(query);
      return result.items.map((group) => ({ label: group, value: group }));
    }
    const definitions =
      field.type === "action-select"
        ? {
            resource: "action" as const,
            fields: ["name", "word"],
            map: (item: SystemRecord) => ({
              label: `${"name" in item ? item.name : ""} · ${"word" in item ? item.word : ""}`,
              value: "code" in item ? item.code : "",
            }),
          }
        : field.type === "role-select"
          ? {
              resource: "role" as const,
              fields: ["name", "word"],
              map: (item: SystemRecord) => ({
                label: `${"name" in item ? item.name : ""} · ${"word" in item ? item.word : ""}`,
                value: item.id,
              }),
            }
          : {
              resource: "user" as const,
              fields: ["username", "code"],
              map: (item: SystemRecord) => ({
                label: `${"username" in item ? item.username : ""} · ${"code" in item ? item.code : ""}`,
                value: item.id,
              }),
            };
    const requests = query
      ? definitions.fields.map((key) =>
          listRecords(definitions.resource, { [key]: query, p: 1, s: 20 }),
        )
      : [listRecords(definitions.resource, { p: 1, s: 20 })];
    const results = await Promise.all(requests);
    const options = new Map<string, SearchableOption>();
    for (const result of results) {
      for (const item of result.items) {
        const option = definitions.map(item);
        options.set(String(option.value), option);
      }
    }
    return [...options.values()];
  };

  const openEditor = (record?: SystemRecord) => {
    const values: Record<string, unknown> = {};
    const selectedOptions: Record<string, SearchableOption[]> = {};
    for (const field of config.fields) values[field.key] = field.defaultValue;
    if (record) {
      for (const field of config.fields) {
        if (field.key === "password") values.password = "";
        else if (field.key === "user_ids" && "users" in record)
          values.user_ids = record.users.map((user) => user.id);
        else if (field.key === "value" && "value" in record)
          values.value = JSON.stringify(record.value, null, 2);
        else
          values[field.key] = (record as unknown as Record<string, unknown>)[
            field.key
          ];
      }
      if ("actions" in record)
        selectedOptions.action_codes = record.actions.map((action) => ({
          label: `${action.name} · ${action.word}`,
          value: action.code,
        }));
      if ("role" in record && record.role)
        selectedOptions.role_id = [
          {
            label: `${record.role.name} · ${record.role.word}`,
            value: record.role.id,
          },
        ];
      if ("users" in record)
        selectedOptions.user_ids = record.users.map((user) => ({
          label: `${user.username} · ${user.code}`,
          value: user.id,
        }));
      if ("group" in record && record.group)
        selectedOptions.group = [{ label: record.group, value: record.group }];
    }
    setEditing(record || null);
    setForm(values);
    setInitialForm(values);
    setEditorOptions(selectedOptions);
    setFormErrors({});
    setEditorOpen(true);
  };

  const submitEditor = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const field of config.fields) {
      const value = form[field.key];
      if (
        (field.required || (!editing && field.key === "password")) &&
        (value === undefined || value === null || value === "")
      )
        nextErrors[field.key] = t("validation.required", {
          field: t(field.label),
        });
    }
    if (resource === "user") {
      if (!isValidUsername(form.username))
        nextErrors.username = t("validation.username");
      if ((!editing || form.password) && !isValidUserPassword(form.password))
        nextErrors.password = t("validation.password");
    }
    if (resource === "dictionary") {
      if (
        typeof form.key !== "string" ||
        !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(form.key)
      )
        nextErrors.key = t("validation.dictionaryKey");
      try {
        JSON.parse(String(form.value));
      } catch {
        nextErrors.value = t("validation.json");
      }
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = {};
      for (const field of config.fields) {
        let value = form[field.key];
        if (field.type === "json" && typeof value === "string")
          value = JSON.parse(value);
        let initialValue = initialForm[field.key];
        if (field.type === "json" && typeof initialValue === "string")
          initialValue = JSON.parse(initialValue);
        if (field.key === "password" && editing && !value) continue;
        if (!editing || JSON.stringify(value) !== JSON.stringify(initialValue))
          payload[field.key] = value;
      }
      if (editing && Object.keys(payload).length === 0) {
        setError(t("messages.noChanges"));
        return;
      }
      if (editing) await updateRecord(resource, editing.id, payload);
      else await createRecord(resource, payload);
      setNotice(t(editing ? "messages.updated" : "messages.created"));
      setEditorOpen(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : t("errors.network"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (ids: number[]) => {
    if (!window.confirm(t("confirm.delete"))) return;
    try {
      await deleteRecords(resource, ids);
      if (records.length === ids.length && page > 1)
        setPage((value) => value - 1);
      else await load();
      setNotice(t("messages.deleted"));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t("errors.network"),
      );
    }
  };

  const approve = async (user: UserRecord, approved: boolean) => {
    const metadata = { ...(user.metadata || {}) };
    if (approved) delete metadata.reject_register_reason;
    else {
      const reason = window.prompt(t("users.rejectionReason"));
      if (!reason?.trim()) return;
      metadata.reject_register_reason = reason.trim();
    }
    await updateRecord("user", user.id, { metadata, status: approved ? 1 : 0 });
    setNotice(t(approved ? "messages.approved" : "messages.rejected"));
    await load();
  };

  const unlock = async (user: UserRecord) => {
    const metadata = { ...(user.metadata || {}) };
    delete metadata.lock_expired_at;
    await updateRecord("user", user.id, { metadata, status: 1 });
    setNotice(t("messages.unlocked"));
    await load();
  };

  const unlockPassword = async (user: UserRecord) => {
    const metadata = { ...(user.metadata || {}) };
    delete metadata.password_change_failures;
    await updateRecord("user", user.id, { metadata });
    setNotice(t("messages.passwordUnlocked"));
    await load();
  };

  const submitLock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lockUser) return;
    const expiration =
      lockMode === "permanent" ? 0 : new Date(lockUntil).getTime();
    if (lockMode === "until" && expiration <= Date.now())
      return setLockError(t("users.futureLock"));
    setLockError("");
    await updateRecord("user", lockUser.id, {
      metadata: { ...(lockUser.metadata || {}), lock_expired_at: expiration },
      status: 2,
    });
    setLockUser(null);
    setNotice(t("messages.locked"));
    await load();
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = records.length > 0 && selected.length === records.length;
  const tableColumns = useMemo(
    () =>
      config.columns.filter((column) => visibleColumnKeys.includes(column.key)),
    [config.columns, visibleColumnKeys],
  );
  const visibleFilters = searchExpanded
    ? config.filters
    : config.filters.slice(0, 3);
  const cellPadding =
    tableDensity === "compact"
      ? "px-3 py-2"
      : tableDensity === "loose"
        ? "px-5 py-4"
        : "px-4 py-3";

  const renderValue = (record: SystemRecord, key: string, kind?: string) => {
    const value = (record as unknown as Record<string, unknown>)[key];
    if (kind === "date") return formatDate(value);
    if (kind === "status")
      return (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${value === 1 ? "bg-success-50 text-success-700 dark:bg-success-500/15" : value === 2 ? "bg-error-50 text-error-700 dark:bg-error-500/15" : "bg-warning-50 text-warning-700 dark:bg-warning-500/15"}`}
        >
          {t(
            value === 1
              ? "status.active"
              : value === 2
                ? "status.locked"
                : "status.pending",
          )}
        </span>
      );
    if (kind === "role")
      return value && typeof value === "object" && "name" in value ? (
        <Link
          className="text-brand-500 hover:underline"
          to={`/system/role?word=${encodeURIComponent(String("word" in value ? value.word : ""))}`}
        >
          {String(value.name)}
        </Link>
      ) : (
        "-"
      );
    if (kind === "tags" && Array.isArray(value))
      return (
        <div className="flex min-w-48 flex-wrap gap-1">
          {value.map((item) => (
            <Link
              key={String(item)}
              className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              to={`/system/action?code=${encodeURIComponent(value.join(","))}`}
            >
              {String(item)}
            </Link>
          ))}
        </div>
      );
    if (kind === "users" && Array.isArray(value))
      return (
        <div className="flex min-w-40 flex-wrap gap-1">
          {value.map((item) => (
            <Link
              key={(item as { id: number }).id}
              className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800"
              to={`/system/user?username=${encodeURIComponent((item as { username: string }).username)}`}
            >
              {(item as { username: string }).username}
            </Link>
          ))}
        </div>
      );
    if (kind === "json") {
      const compact = JSON.stringify(value);
      return (
        <details className="group max-w-80">
          <summary className="font-mono max-w-80 cursor-pointer truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {compact}
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap dark:bg-gray-800">
            {JSON.stringify(value, null, 2)}
          </pre>
        </details>
      );
    }
    if (kind === "boolean")
      return (
        <span
          className={`rounded px-2 py-1 text-xs ${value ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
        >
          {t(value ? "common.yes" : "common.no")}
        </span>
      );
    if (kind === "category")
      return (
        <span
          className={`rounded px-2 py-1 text-xs ${value === 0 ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"}`}
        >
          {t(value === 0 ? "category.permission" : "category.jwt")}
        </span>
      );
    if (kind === "rules" && typeof value === "string")
      return (
        <div className="flex min-w-52 flex-wrap gap-1">
          {value
            .split(/\r?\n/)
            .filter(Boolean)
            .map((rule) => (
              <span
                key={rule}
                className={`rounded px-2 py-1 text-xs ${"category" in record && typeof record.category === "number" ? (record.category === 0 ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300") : rule.trim().toUpperCase().startsWith("DELETE|") ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300" : rule.trim().toUpperCase().startsWith("GET|") ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : rule.trim().toUpperCase().startsWith("PATCH|") ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" : rule.trim().toUpperCase().startsWith("POST|") ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
              >
                {rule}
              </span>
            ))}
        </div>
      );
    return value === undefined || value === null || value === ""
      ? "-"
      : String(value);
  };

  const updateForm = (field: FieldConfig, value: unknown) => {
    setForm((current) => ({ ...current, [field.key]: value }));
    setFormErrors((current) => ({ ...current, [field.key]: "" }));
  };

  return (
    <>
      <PageMeta
        title={`${t(config.title)} | TailAdmin`}
        description={t("system.description")}
      />
      <PageBreadCrumb pageTitle={t(config.title)} />
      <div
        className={`space-y-5 ${isFullscreen ? "fixed inset-0 z-99999 overflow-auto bg-gray-50 p-4 dark:bg-gray-950" : ""}`}
        ref={tableContainerRef}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch();
            }}
          >
            {visibleFilters.map((filter) =>
              filter.type === "status" ? (
                <SimpleSelect
                  ariaLabel={t(filter.label)}
                  key={filter.key}
                  name={filter.key}
                  onChange={(nextValue) => {
                    const next = {
                      ...draftFilters,
                      [filter.key]: String(nextValue),
                    };
                    setDraftFilters(next);
                    scheduleSearch(next);
                  }}
                  options={[
                    { label: t(filter.label), value: "" },
                    { label: t("status.pending"), value: "0" },
                    { label: t("status.active"), value: "1" },
                    { label: t("status.locked"), value: "2" },
                  ]}
                  placeholder={t(filter.label)}
                  value={draftFilters[filter.key] || ""}
                />
              ) : filter.type === "boolean" ? (
                <SimpleSelect
                  ariaLabel={t(filter.label)}
                  key={filter.key}
                  name={filter.key}
                  onChange={(nextValue) => {
                    const next = {
                      ...draftFilters,
                      [filter.key]: String(nextValue),
                    };
                    setDraftFilters(next);
                    scheduleSearch(next);
                  }}
                  options={[
                    { label: t(filter.label), value: "" },
                    { label: t("common.yes"), value: "true" },
                    { label: t("common.no"), value: "false" },
                  ]}
                  placeholder={t(filter.label)}
                  value={draftFilters[filter.key] || ""}
                />
              ) : filter.type === "category" ? (
                <SimpleSelect
                  ariaLabel={t(filter.label)}
                  key={filter.key}
                  name={filter.key}
                  onChange={(nextValue) => {
                    const next = {
                      ...draftFilters,
                      [filter.key]: String(nextValue),
                    };
                    setDraftFilters(next);
                    scheduleSearch(next);
                  }}
                  options={[
                    { label: t(filter.label), value: "" },
                    { label: t("category.permission"), value: "0" },
                    { label: t("category.jwt"), value: "1" },
                  ]}
                  placeholder={t(filter.label)}
                  value={draftFilters[filter.key] || ""}
                />
              ) : (
                <SearchFilterInput
                  fieldKey={filter.key}
                  key={filter.key}
                  label={t(filter.label)}
                  onChange={(nextValue) =>
                    setDraftFilters((value) => ({
                      ...value,
                      [filter.key]: nextValue,
                    }))
                  }
                  onCommit={(nextValue) =>
                    scheduleSearch({ ...draftFilters, [filter.key]: nextValue })
                  }
                  resource={resource}
                  value={draftFilters[filter.key] || ""}
                />
              ),
            )}
            <div className="flex items-center gap-2">
              <button
                className={`${buttonClass} bg-brand-500 text-white hover:bg-brand-600`}
                type="submit"
              >
                {t("common.search")}
              </button>
              <button
                className={`${buttonClass} border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300`}
                onClick={() => {
                  window.clearTimeout(autoSearchTimer.current);
                  setDraftFilters({});
                  setFilters({});
                  setPage(1);
                }}
                type="button"
              >
                {t("common.reset")}
              </button>
              {config.filters.length > 3 && (
                <button
                  className="inline-flex items-center gap-1 px-2 py-2 text-sm font-medium text-brand-500"
                  onClick={() => setSearchExpanded((current) => !current)}
                  type="button"
                >
                  {t(searchExpanded ? "common.less" : "common.more")}
                  <span aria-hidden="true">{searchExpanded ? "⌃" : "⌄"}</span>
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              {can("create") && (
                <button
                  className={`${buttonClass} bg-brand-500 text-white hover:bg-brand-600`}
                  onClick={() => openEditor()}
                  type="button"
                >
                  {t("common.create")}
                </button>
              )}
              {can("delete") && selected.length > 0 && (
                <button
                  className={`${buttonClass} bg-error-500 text-white`}
                  onClick={() => void remove(selected)}
                  type="button"
                >
                  {t("common.batchDelete")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                aria-label={t("common.refresh")}
                className={`${buttonClass} border border-gray-300 dark:border-gray-700`}
                onClick={() => void load()}
                title={t("common.refresh")}
              >
                <RegenerateIcon className="size-4" />
              </button>
              <details className="relative">
                <summary
                  className={`${buttonClass} cursor-pointer list-none border border-gray-300 dark:border-gray-700`}
                  aria-label={t("table.density")}
                  role="button"
                >
                  <ListIcon className="size-4" />
                </summary>
                <div className="absolute end-0 z-40 mt-2 w-36 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
                  {(["compact", "default", "loose"] as const).map((density) => (
                    <button
                      className={`block w-full rounded-lg px-3 py-2 text-start text-sm ${tableDensity === density ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "hover:bg-gray-100 dark:hover:bg-white/5"}`}
                      key={density}
                      onClick={() => setTableDensity(density)}
                      type="button"
                    >
                      {t(`table.${density}`)}
                    </button>
                  ))}
                </div>
              </details>
              <button
                aria-label={t(
                  isFullscreen ? "table.exitFullscreen" : "table.fullscreen",
                )}
                className={`${buttonClass} border border-gray-300 dark:border-gray-700`}
                onClick={() => setIsFullscreen((current) => !current)}
                title={t(
                  isFullscreen ? "table.exitFullscreen" : "table.fullscreen",
                )}
              >
                <AspectIcon className="size-4" />
              </button>
              <details className="relative">
                <summary
                  className={`${buttonClass} cursor-pointer list-none border border-gray-300 dark:border-gray-700`}
                  aria-label={t("table.columns")}
                  role="button"
                >
                  <ListIcon className="size-4" />
                </summary>
                <div className="absolute end-0 z-40 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
                  <p className="mb-2 text-sm font-semibold">
                    {t("table.visibleColumns")}
                  </p>
                  {config.columns.map((column) => (
                    <label
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                      key={column.key}
                    >
                      <Checkbox
                        checked={visibleColumnKeys.includes(column.key)}
                        onChange={() =>
                          setVisibleColumnKeys((current) =>
                            current.includes(column.key)
                              ? current.filter((key) => key !== column.key)
                              : [...current, column.key],
                          )
                        }
                      />
                      {t(column.label)}
                    </label>
                  ))}
                </div>
              </details>
              <details className="relative">
                <summary
                  className={`${buttonClass} cursor-pointer list-none border border-gray-300 dark:border-gray-700`}
                  aria-label={t("table.style")}
                  role="button"
                >
                  <SettingsAltIcon className="size-4" />
                </summary>
                <div className="absolute end-0 z-40 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
                  {(["bordered", "striped", "sticky"] as const).map(
                    (setting) => (
                      <label
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                        key={setting}
                      >
                        {t(`table.${setting}`)}
                        <Switch
                          checked={tableSettings[setting]}
                          onChange={(checked) =>
                            setTableSettings((current) => ({
                              ...current,
                              [setting]: checked,
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              </details>
            </div>
          </div>
          {error && (
            <p className="m-5 rounded-lg bg-error-50 p-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </p>
          )}
          {notice && (
            <p
              className="m-5 rounded-lg bg-success-50 p-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-300"
              role="status"
            >
              {notice}
            </p>
          )}
          {!can("read") ? (
            <p className="p-8 text-center text-gray-500">
              {t("errors.noPermission")}
            </p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead
                  className={tableSettings.sticky ? "sticky top-0 z-20" : ""}
                >
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase dark:border-gray-800 dark:bg-gray-900">
                    <th
                      className={`${cellPadding} ${tableSettings.bordered ? "border-e border-gray-200 dark:border-gray-800" : ""}`}
                    >
                      <Checkbox
                        checked={allSelected}
                        onChange={(checked) =>
                          setSelected(
                            checked
                              ? records.map((record) => record.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    {tableColumns.map((column) => (
                      <th
                        className={`${cellPadding} text-start whitespace-nowrap ${tableSettings.bordered ? "border-e border-gray-200 dark:border-gray-800" : ""}`}
                        key={column.key}
                      >
                        {t(column.label)}
                      </th>
                    ))}
                    {(can("update") || can("delete")) && (
                      <th className="sticky end-0 z-10 border-s border-gray-200 bg-gray-50 px-4 py-3 text-start shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
                        {t("common.actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, rowIndex) => (
                    <tr
                      className={`group border-b border-gray-100 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/3 ${tableSettings.striped && rowIndex % 2 === 1 ? "bg-gray-50/70 dark:bg-white/2" : ""}`}
                      key={record.id}
                    >
                      <td
                        className={`${cellPadding} ${tableSettings.bordered ? "border-e border-gray-100 dark:border-gray-800" : ""}`}
                      >
                        <Checkbox
                          checked={selected.includes(record.id)}
                          onChange={(checked) =>
                            setSelected((values) =>
                              checked
                                ? [...values, record.id]
                                : values.filter((id) => id !== record.id),
                            )
                          }
                        />
                      </td>
                      {tableColumns.map((column) => (
                        <td
                          className={`max-w-96 align-top ${cellPadding} ${tableSettings.bordered ? "border-e border-gray-100 dark:border-gray-800" : ""}`}
                          key={column.key}
                        >
                          {renderValue(record, column.key, column.kind)}
                        </td>
                      ))}
                      {(can("update") || can("delete")) && (
                        <td
                          className={`sticky end-0 z-10 min-w-52 border-s border-gray-100 bg-white align-top shadow-theme-sm group-hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:group-hover:bg-gray-900 ${cellPadding}`}
                        >
                          <div className="flex flex-wrap gap-2">
                            {can("update") &&
                              resource === "user" &&
                              (record as UserRecord).status === 0 && (
                                <>
                                  <button
                                    className="text-brand-500"
                                    onClick={() =>
                                      void approve(record as UserRecord, true)
                                    }
                                  >
                                    {t("users.approve")}
                                  </button>
                                  <button
                                    className="text-warning-600"
                                    onClick={() =>
                                      void approve(record as UserRecord, false)
                                    }
                                  >
                                    {t("users.reject")}
                                  </button>
                                </>
                              )}
                            {can("update") && (
                              <button
                                className="text-brand-500"
                                onClick={() => openEditor(record)}
                              >
                                {t("common.edit")}
                              </button>
                            )}
                            {can("update") &&
                              resource === "user" &&
                              (record as UserRecord).status === 1 && (
                                <button
                                  className="text-warning-600"
                                  onClick={() =>
                                    setLockUser(record as UserRecord)
                                  }
                                >
                                  {t("users.lock")}
                                </button>
                              )}
                            {can("update") &&
                              resource === "user" &&
                              (record as UserRecord).status === 2 && (
                                <button
                                  className="text-success-600"
                                  onClick={() =>
                                    void unlock(record as UserRecord)
                                  }
                                >
                                  {t("users.unlock")}
                                </button>
                              )}
                            {can("update") &&
                              resource === "user" &&
                              Number(
                                (record as UserRecord).metadata
                                  ?.password_change_failures || 0,
                              ) > 0 && (
                                <button
                                  className="text-success-600"
                                  onClick={() =>
                                    void unlockPassword(record as UserRecord)
                                  }
                                >
                                  {t("users.unlockPassword")}
                                </button>
                              )}
                            {can("delete") && (
                              <button
                                className="text-error-500"
                                onClick={() => void remove([record.id])}
                              >
                                {t("common.delete")}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && (
                <p className="p-8 text-center text-gray-500">
                  {t("common.loading")}
                </p>
              )}
              {!loading && records.length === 0 && (
                <p className="p-8 text-center text-gray-500">
                  {t("table.empty")}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-5 dark:border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{t("table.total", { count: total })}</span>
              <SimpleSelect
                ariaLabel={t("table.pageSize")}
                className="w-24"
                onChange={(nextValue) => {
                  setPageSize(Number(nextValue));
                  setPage(1);
                }}
                options={[10, 20, 50].map((size) => ({
                  label: `${size} / ${t("table.page")}`,
                  value: size,
                }))}
                value={pageSize}
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label={t("common.previous")}
                className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeftIcon className="size-4 rtl:rotate-180" />
              </button>
              {Array.from({ length: pages }, (_, index) => index + 1)
                .filter(
                  (item) =>
                    pages <= 7 ||
                    item === 1 ||
                    item === pages ||
                    Math.abs(item - page) <= 1,
                )
                .map((item, index, items) => (
                  <span className="contents" key={item}>
                    {index > 0 && item - items[index - 1] > 1 && (
                      <span className="px-1 text-gray-400">…</span>
                    )}
                    <button
                      aria-current={item === page ? "page" : undefined}
                      className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium ${item === page ? "bg-brand-500 text-white" : "border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"}`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  </span>
                ))}
              <button
                aria-label={t("common.next")}
                className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronLeftIcon className="size-4 rotate-180 rtl:rotate-0" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        className="max-h-[90vh] max-w-2xl overflow-y-auto p-6 sm:p-8"
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
      >
        <h3 className="mb-6 text-xl font-semibold text-gray-800 dark:text-white/90">
          {t(editing ? "common.editEntity" : "common.createEntity", {
            entity: t(config.entity),
          })}
        </h3>
        <form className="space-y-5" noValidate onSubmit={submitEditor}>
          {config.fields.map((field) => {
            const fieldId = `${resource}-${field.key}`;
            const searchable = [
              "action-group",
              "action-select",
              "role-select",
              "user-select",
            ].includes(field.type);
            return (
              <div key={field.key}>
                <label
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor={fieldId}
                >
                  {t(field.label)}
                  {(field.required ||
                    (!editing && field.key === "password")) && (
                    <span className="text-error-500"> *</span>
                  )}
                </label>
                {field.type === "textarea" || field.type === "json" ? (
                  <textarea
                    aria-invalid={Boolean(formErrors[field.key])}
                    className={`${inputClass} max-h-72 min-h-28 resize-y ${formErrors[field.key] ? "border-error-500 focus:border-error-500" : ""}`}
                    id={fieldId}
                    name={field.key}
                    onChange={(event) => updateForm(field, event.target.value)}
                    value={String(form[field.key] ?? "")}
                  />
                ) : field.type === "boolean" ? (
                  <Switch
                    checked={Boolean(form[field.key])}
                    label={form[field.key] ? t("common.yes") : t("common.no")}
                    onChange={(checked) => updateForm(field, checked)}
                  />
                ) : field.type === "category" ? (
                  <SimpleSelect
                    ariaLabel={t(field.label)}
                    id={fieldId}
                    name={field.key}
                    onChange={(nextValue) =>
                      updateForm(field, Number(nextValue))
                    }
                    options={[
                      { label: t("category.permission"), value: 0 },
                      { label: t("category.jwt"), value: 1 },
                    ]}
                    value={Number(form[field.key] ?? 0)}
                  />
                ) : searchable ? (
                  <SearchableSelect
                    allowCustom={field.type === "action-group"}
                    id={fieldId}
                    initialOptions={editorOptions[field.key]}
                    multiple={
                      field.type === "action-select" ||
                      field.type === "user-select"
                    }
                    name={field.key}
                    onChange={(value) => updateForm(field, value)}
                    onSearch={(query) => searchEditorOptions(field, query)}
                    value={form[field.key]}
                  />
                ) : (
                  <input
                    aria-invalid={Boolean(formErrors[field.key])}
                    autoComplete={
                      field.type === "password" ? "new-password" : undefined
                    }
                    className={`${inputClass} ${formErrors[field.key] ? "border-error-500 focus:border-error-500" : ""}`}
                    id={fieldId}
                    name={field.key}
                    onChange={(event) => updateForm(field, event.target.value)}
                    type={field.type === "password" ? "password" : "text"}
                    value={String(form[field.key] ?? "")}
                  />
                )}
                {formErrors[field.key] && (
                  <p className="mt-1.5 text-xs text-error-500" role="alert">
                    {formErrors[field.key]}
                  </p>
                )}
              </div>
            );
          })}
          {error && (
            <p className="rounded-lg bg-error-50 p-3 text-sm text-error-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              className={`${buttonClass} border border-gray-300 dark:border-gray-700`}
              onClick={() => setEditorOpen(false)}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className={`${buttonClass} bg-brand-500 text-white`}
              disabled={submitting}
              type="submit"
            >
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        className="max-w-lg p-6 sm:p-8"
        isOpen={Boolean(lockUser)}
        onClose={() => setLockUser(null)}
      >
        <h3 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">
          {t("users.lockTitle", { name: lockUser?.username })}
        </h3>
        <form className="space-y-5" noValidate onSubmit={submitLock}>
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="lock-mode"
            >
              {t("users.lockType")}
            </label>
            <SimpleSelect
              id="lock-mode"
              onChange={(nextValue) =>
                setLockMode(nextValue as "until" | "permanent")
              }
              options={[
                { label: t("users.until"), value: "until" },
                { label: t("users.permanent"), value: "permanent" },
              ]}
              value={lockMode}
            />
          </div>
          {lockMode === "until" && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t("users.lockedUntil")}
              </label>
              <input
                aria-invalid={Boolean(lockError)}
                className={`${inputClass} ${lockError ? "border-error-500 focus:border-error-500" : ""}`}
                onChange={(event) => {
                  setLockUntil(event.target.value);
                  setLockError("");
                }}
                type="datetime-local"
                value={lockUntil}
              />
              {lockError && (
                <p className="mt-1.5 text-xs text-error-500" role="alert">
                  {lockError}
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              className={`${buttonClass} border border-gray-300`}
              onClick={() => setLockUser(null)}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className={`${buttonClass} bg-warning-500 text-white`}
              type="submit"
            >
              {t("users.lock")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

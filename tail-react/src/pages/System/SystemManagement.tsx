import { canSystemControl } from "@/utils/admin/system-permissions";
import { defaultUserColumns, systemListFields } from "@/utils/admin/list-fields";
import { authorizedEditorPayload, canDeleteAssignedRecord, canManageDefinition, isAssignmentField, isExistingCredentialField } from "./components/assignment-policy";
import { isValidActionGroup } from "./components/action-group-model";
import { permissionResult } from "./components/permission-result";
import { Field } from "./developer/ResourceEditor";
import ActionGroupNavigation from "./ActionGroupNavigation";
import PermissionEditor from "./PermissionEditor";
import { resolveResourceBindings } from "./components/resource-catalog";
import { getPermissionCatalog, type ActionResourceBinding } from "@/api/system";
import NotFound from "@/pages/OtherPage/NotFound";
import ActiveFilters from "./active-filters";
import { useDefaultPageSize } from "@/utils/admin/page-size";
import ManagementOverview from "./management-overview";
import ResourceCards from "./resource-cards";
import RecordDetail from "./record-detail";
import AssociationEditor from "./association-editor";
import GroupMemberEditor from "./group-member-editor";
import RuleListEditor from "./rule-list-editor";
import {
  AdminDrawer,
  AButton,
  useAdminText,
  useAdminTimezone,
} from "./admin-ui";
import { getAdminRecord } from "@/utils/admin/service";
import {
  adminDate,
  parseAdminDateTime,
  sameAdminValue,
  type AdminRecord,
} from "@/utils/admin/model";
import ResultToolbar from "./ResultToolbar";
import { apiRequest, ApiError } from "@/api/client";
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
import { ChevronLeftIcon } from "@/icons";
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
  ].includes(value || "");
}

function formatDateTimeInput(value: number, zone?: string) {
  return adminDate(value, zone).slice(0, 16).replace(" ", "T");
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
  const text = useAdminText();
  const timezone = useAdminTimezone();
  const [view, setView] = useState<"cards" | "matrix" | "table">(
    resource === "user" ? "table" : resource === "action" ? "matrix" : "cards",
  );
  const [viewResource, setViewResource] = useState(resource);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [actionLocales, setActionLocales] = useState<{ tag: string; name: string }[]>([]);
  useEffect(() => {
    if (resource !== "action") return;
    let active = true;
    apiRequest<{ locales: { tag: string; name: string }[] }>("/dictionary/pub/i18n?f=locales", { auth: false }).then(value => { if (active) setActionLocales(value.locales); }).catch(() => { if (active) setActionLocales([{ tag: "zh-CN", name: t("developer.zh") }, { tag: "en-US", name: t("developer.en") }]); });
    return () => { active = false; };
  }, [resource, t]);
  const [detailRecord, setDetailRecord] = useState<AdminRecord>();
  const [memberAdded, setMemberAdded] = useState<number[]>([]);
  const [memberRemoved, setMemberRemoved] = useState<number[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [records, setRecords] = useState<SystemRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const defaultSize = useDefaultPageSize();
  const [pageSize, setPageSize] = useState(defaultSize);
  useEffect(() => {
    setPageSize(defaultSize);
    setPage(1);
  }, [defaultSize]);
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
  const [permissionValid, setPermissionValid] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editorOptions, setEditorOptions] = useState<
    Record<string, SearchableOption[]>
  >({});
  const [lockUser, setLockUser] = useState<UserRecord | null>(null);
  const [lockMode, setLockMode] = useState<"until" | "permanent">("until");
  const [lockUntil, setLockUntil] = useState(() =>
    formatDateTimeInput(Date.now() + 86400000, timezone),
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
    resource === "user" ? defaultUserColumns : config.columns.map((column) => column.key),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const listRun = useRef(0);
  const editorRun = useRef(0);
  const autoSearchTimer = useRef<number | undefined>(undefined);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const canOpenPage =
    isResource(resourceParam) &&
    auth.canMenu(
      `/system/${resource}`,
    );
  const access = useRef(auth);
  useEffect(() => { access.current = auth; }, [auth]);
  const canControl = useCallback((control: string) => canSystemControl(auth, resource, control), [auth, resource]);
  const currentControl = (control: string) => canSystemControl(access.current, resource, control);
  const canRead = canOpenPage;
  const manageableDefinition = (record: Record<string, unknown>, permissionAuth = auth) => resource !== "action" || !!record.config && canManageDefinition(String(record.word ?? ""), (record.config as { builtin?: string }).builtin, permissionAuth.user?.permission.permission_scope === "*", permissionAuth.canButton("system.developer.publish"), (record.config as { permission_scope?: string }).permission_scope);
  const canRemoveRecord = (record: Record<string, unknown>, control = "delete", permissionAuth = auth) => canSystemControl(permissionAuth, resource, control) && manageableDefinition(record, permissionAuth) && canDeleteAssignedRecord(resource, record, permissionAuth.user?.permission.permission_scope === "*" || !!permissionAuth.user?.permission.permission_scopes?.includes(`${resource}:delete`));
  const canSelectRecord = (record: Record<string, unknown>) => canRemoveRecord(record, "delete-selected");
  const openDetail = (record: AdminRecord) => { if (canControl("view-detail") && !loading) setDetailRecord(record); };

  const protectDeletion = !(auth.user?.permission.permission_scope === "*" || auth.user?.permission.permission_scopes?.includes(`${resource}:delete`)) && (canControl("delete") || canControl("delete-selected"));
  const listFields = systemListFields(resource, view, visibleColumnKeys, protectDeletion);

  const load = useCallback(async () => {
    const run = ++listRun.current;
    if (viewResource !== resource || !canRead) return;
    setLoading(true);
    setError("");
    try {
      const result = await listRecords(resource, {
        p: page,
        s: pageSize,
        ...filters,
        f: listFields,
      });
      if (run !== listRun.current) return;
      setRecords(
        result.items.map((record) =>
          resource === "user-group"
            ? {
                ...record,
                users:
                  "member_preview" in record
                    ? record.member_preview
                    : "users" in record
                      ? record.users
                      : [],
              }
            : "role_summary" in record ? { ...record, role: record.role_summary } : record,
        ) as SystemRecord[],
      );
      setTotal(result.t);
      setSelected([]);
    } catch (caught) {
      if (run !== listRun.current) return;
      setRecords([]);
      setTotal(0);
      setError(
        caught instanceof ApiError ? caught.message : t("errors.network"),
      );
    } finally {
      if (run === listRun.current) setLoading(false);
    }
  }, [canRead, filters, page, pageSize, resource, t, listFields, viewResource]);

  useEffect(() => {
    void load();
    return () => { listRun.current++; editorRun.current++; };
  }, [load]);
  useEffect(() => {
    const routeFilters = Object.fromEntries(
      [
        ...config.filters,
        ...[
          "created_from",
          "created_to",
          "last_logged_in_from",
          "last_logged_in_to",
          "has_permissions",
          "has_members",
          "group_exact",
          "groups_all",
          "groups_exact",
        ].map((key) => ({ key })),
      ]
        .map((filter) => [filter.key, searchParams.get(filter.key) || ""])
        .filter(([, value]) => value),
    );
    setViewResource(resource);
    setView(
      resource === "user"
        ? "table"
        : resource === "action"
          ? "matrix"
          : "cards",
    );
    setDetailRecord(undefined);
    setPage(1);
    setFilters(routeFilters);
    setDraftFilters(routeFilters);
    setRecords([]);
    setSearchExpanded(false);
    setVisibleColumnKeys(resource === "user" ? defaultUserColumns : config.columns.map((column) => column.key));
  }, [config.columns, config.filters, resource, searchParams]);
  useEffect(() => () => window.clearTimeout(autoSearchTimer.current), [canControl]);

  const applySearch = (nextFilters = draftFilters, control: "query" | "reset-query" = "query") => {
    if (!currentControl(control)) return;
    window.clearTimeout(autoSearchTimer.current);
    setPage(1);
    setFilters({ ...nextFilters });
  };

  const scheduleSearch = (nextFilters = draftFilters) => {
    window.clearTimeout(autoSearchTimer.current);
    if (!currentControl("query")) return;
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
    if (!auth.canMenu(`/system/${definitions.resource}`)) return [];
    const f =
      definitions.resource === "role"
        ? "id,name,word"
        : definitions.resource === "user"
          ? "id,username,code"
          : "id,name,word,code";
    const requests = [
      listRecords(definitions.resource, { q: query, p: 1, s: 20, f }),
    ];
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

  const openEditor = async (sparse?: SystemRecord) => {
    if (!currentControl(sparse ? "edit" : "create") || loading) return;
    const run = ++editorRun.current;
    let record: SystemRecord | undefined;
    try { record = sparse ? await getAdminRecord(resource, sparse.id) as unknown as SystemRecord : undefined; }
    catch (cause) { if (run === editorRun.current) setError(cause instanceof Error ? cause.message : t("errors.network")); return; }
    if (run !== editorRun.current || !currentControl(sparse ? "edit" : "create")) return;
    if (record && !manageableDefinition(record as unknown as AdminRecord, access.current)) return;
    setDetailRecord(undefined);
    setMemberAdded([]);
    setMemberRemoved([]);
    const values: Record<string, unknown> = {};
    const selectedOptions: Record<string, SearchableOption[]> = {};
    for (const field of config.fields) values[field.key] = field.defaultValue;
    if (record) {
      for (const field of config.fields) {
        if (field.key === "password") values.password = "";
        else if (field.key === "user_ids" && "users" in record)
          values.user_ids = (Array.isArray(record.users) ? record.users : []).map((user: { id: number }) => user.id);
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
        selectedOptions.user_ids = (Array.isArray(record.users) ? record.users : []).map((user: { username: string; code: string; id: number }) => ({
          label: `${user.username} · ${user.code}`,
          value: user.id,
        }));
      if ("group" in record && record.group)
        selectedOptions.group = [{ label: record.group, value: record.group }];
    }
    if (resource === "action" && record && "config" in record) { values.config = record.config; values.names = record.names ?? {}; }
    setPermissionValid(true);
    setEditing(record || null);
    setForm(values);
    setInitialForm(values);
    setEditorOptions(selectedOptions);
    setFormErrors({});
    setEditorOpen(true);
  };

  const submitEditor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentControl(editing ? "edit" : "create") || (editing && !manageableDefinition(editing as unknown as AdminRecord, access.current))) return;
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
    if (resource === "action") {
      if (typeof form.word !== "string" || !/^[a-z][a-z0-9_-]*:(?:read|create|update|delete|all|default|grant):[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)+$/.test(form.word) || form.word.length > 128) nextErrors.word = t("catalogUI.invalid");
      if (typeof form.group !== "string" || !isValidActionGroup(form.group, String(form.word).split(":")[0])) nextErrors.group = t("catalogUI.invalid");
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
    if (Object.keys(nextErrors).length || !permissionValid) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      let payload: Record<string, unknown> = {};
      for (const field of config.fields) {
        let value = form[field.key];
        if (typeof value === "string" && field.type !== "json")
          value = value.trim();
        if (field.type === "json" && typeof value === "string")
          value = JSON.parse(value);
        let initialValue = initialForm[field.key];
        if (field.type === "json" && typeof initialValue === "string")
          initialValue = JSON.parse(initialValue);
        if (field.key === "password" && editing && !value) continue;
        if (!editing || !sameAdminValue(value, initialValue))
          payload[field.key] = value;
      }
      if (resource === "action") { delete payload.name; payload.names = Object.fromEntries(Object.entries((form.names ?? {}) as Record<string,string>).filter(([tag, value]) => !editing || value !== ((initialForm.names ?? {}) as Record<string,string>)[tag])); payload.config = form.config ?? { bindings: [], ui: [], endpoints: [] }; }
      if (form.action_bindings !== undefined) {
        const bindings = form.action_bindings as ActionResourceBinding[];
        if (resource === "action") {
          const catalog = await getPermissionCatalog();
          payload.config = resolveResourceBindings(catalog.resource_catalog, String(bindings[0]?.resource_key.split(":")[0] ?? "admin"), bindings);
        } else {
          delete payload.action_codes;
          payload.action_bindings = bindings;
        }
      }
      if (resource === "user-group" && editing) {
        delete payload.user_ids;
        if (memberAdded.length) payload.add_user_ids = memberAdded;
        if (memberRemoved.length) payload.remove_user_ids = memberRemoved;
      }
      payload = authorizedEditorPayload(resource, payload, access.current.user?.permission.permission_scope === "*" || !!access.current.user?.permission.permission_scopes?.includes(`${resource}:${editing ? "update" : "create"}`), access.current.user?.permission.permission_scope === "*", !!editing);
      if (editing && Object.keys(payload).length === 0) {
        setError(t("messages.noChanges"));
        return;
      }
      if (!currentControl(editing ? "edit" : "create") || (editing && !manageableDefinition(editing as unknown as AdminRecord, access.current))) return;
      if (editing) await updateRecord(resource, editing.id, payload);
      else await createRecord(resource, payload);
      setNotice(t(editing ? "messages.updated" : "messages.created"));
      setEditorOpen(false);
      setSummaryRevision((value) => value + 1);
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

  const remove = async (ids: number[], control: "delete" | "delete-selected" = "delete") => {
    if (!ids.length || !currentControl(control) || ids.some(id => !records.some(record => record.id === id))) return;
    try {
      const details = await Promise.all(ids.map(id => getAdminRecord(resource, id)));
      if (!currentControl(control) || details.some(record => !canRemoveRecord(record, control, access.current))) return;
      if (!window.confirm(t("confirm.delete")) || !currentControl(control)) return;
      await deleteRecords(resource, ids);
      if (records.length === ids.length && page > 1) setPage(value => value - 1);
      else { setSummaryRevision(value => value + 1); await load(); }
      setNotice(t("messages.deleted"));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t("errors.network")); }
  };

  const approve = async (user: UserRecord, approved: boolean) => {
    if (resource !== "user" || !currentControl("approve")) return;
    const metadata = { ...(user.metadata || {}) };
    if (approved) delete metadata.reject_register_reason;
    else {
      const reason = window.prompt(t("users.rejectionReason"));
      if (!reason?.trim()) return;
      metadata.reject_register_reason = reason.trim();
    }
    await updateRecord("user", user.id, { metadata, status: approved ? 1 : 0 });
    setNotice(t(approved ? "messages.approved" : "messages.rejected"));
    setSummaryRevision((value) => value + 1);
    await load();
  };

  const unlock = async (user: UserRecord) => {
    if (resource !== "user" || !currentControl("unlock")) return;
    const metadata = { ...(user.metadata || {}) };
    delete metadata.lock_expired_at;
    await updateRecord("user", user.id, { metadata, status: 1 });
    setNotice(t("messages.unlocked"));
    setSummaryRevision((value) => value + 1);
    await load();
  };

  const unlockPassword = async (user: UserRecord) => {
    if (resource !== "user" || !currentControl("unlock-password")) return;
    const metadata = { ...(user.metadata || {}) };
    delete metadata.password_change_failures;
    await updateRecord("user", user.id, { metadata });
    setNotice(t("messages.passwordUnlocked"));
    setSummaryRevision((value) => value + 1);
    await load();
  };

  const submitLock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lockUser || resource !== "user" || !currentControl("lock")) return;
    const expiration =
      lockMode === "permanent" ? 0 : parseAdminDateTime(lockUntil, timezone);
    // eslint-disable-next-line react-hooks/purity -- This deadline check runs only in the form submit handler.
    if (lockMode === "until" && expiration <= Date.now())
      return setLockError(t("users.futureLock"));
    setLockError("");
    await updateRecord("user", lockUser.id, {
      metadata: { ...(lockUser.metadata || {}), lock_expired_at: expiration },
      status: 2,
    });
    setLockUser(null);
    setNotice(t("messages.locked"));
    setSummaryRevision((value) => value + 1);
    await load();
  };

  function closeEditor() {
    if (submitting) return;
    if (
      JSON.stringify(form) !== JSON.stringify(initialForm) ||
      memberAdded.length ||
      memberRemoved.length
    )
      setDiscardOpen(true);
    else setEditorOpen(false);
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selectableRecords = records.filter(record => canSelectRecord(record as unknown as AdminRecord));
  const checkedSelected = selected.filter(id => selectableRecords.some(record => record.id === id));
  const allSelected = selectableRecords.length > 0 && checkedSelected.length === selectableRecords.length;
  const tableColumns = useMemo(
    () =>
      config.columns.filter(
        (column) =>
          visibleColumnKeys.includes(column.key) &&
          (view !== "matrix" ||
            ["name", "resource", "menu", "button"].includes(column.key)),
      ),
    [config.columns, visibleColumnKeys, view],
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
    if (resource === "action" && ["resource", "menu", "button"].includes(key) && "config" in record) {
      const result = permissionResult(record.config);
      const labels = key === "resource" ? result.operations.map(operation => String(t(`operations.${operation}`, {defaultValue:operation}))) : key === "menu" ? result.menus.map(menu => String(t(`menus.${menu}`, {defaultValue:menu}))) : result.features.map(feature => String(t(`features.${feature}`, {defaultValue:feature})));
      return <button className="flex max-w-80 flex-wrap gap-1 text-start" type="button" disabled={!canControl("view-detail")} onClick={() => openDetail(record as unknown as AdminRecord)}>{(result.all ? [t("catalogUI.all")] : labels.length ? labels : ["—"]).map((label, index) => <span key={`${index}:${label}`} className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{label}</span>)}</button>;
    }
    if (key === "last_logged_in_at" && !value)
      return text("system-insights.neverLoggedIn");
    if (kind === "date" || key.endsWith("_at"))
      return adminDate(value, timezone);
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
            .map((rule, index) => (
              <span
                key={`${index}:${rule}`}
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

  if (!canOpenPage) return <NotFound />;
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
        {resource === "action" && <ActionGroupNavigation onSaved={() => { setSummaryRevision(value => value + 1); void load(); }} revision={summaryRevision} selected={filters.group_exact} onChange={group => { const next = {...draftFilters}; if (group === undefined) delete next.group_exact; else next.group_exact = group; setDraftFilters(next); applySearch(next); }} />}
        <ManagementOverview
          resource={resource}
          allowed={canRead}
          refreshKey={summaryRevision}
          filters={filters}
          onFilter={(updates) => {
            const next = { ...draftFilters };
            for (const [key, value] of Object.entries(updates)) {
              if (value === undefined) delete next[key];
              else next[key] = String(value);
            }
            setDraftFilters(next);
            applySearch(next);
          }}
          onGroup={(id) => { if (canControl("view-detail")) void getAdminRecord("user-group", id).then(openDetail); }}
        />
        <ActiveFilters
          filters={filters}
          onChange={(updates) => {
            const next = { ...draftFilters };
            for (const [key, value] of Object.entries(updates)) {
              if (value === undefined) delete next[key];
              else next[key] = String(value);
            }
            setDraftFilters(next);
            applySearch(next);
          }}
        />
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
              {canControl("query") && <button
                className={`${buttonClass} bg-brand-500 text-white hover:bg-brand-600`}
                type="submit"
              >
                {t("common.search")}
              </button>}
              {canControl("reset-query") && <button
                className={`${buttonClass} border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300`}
                onClick={() => {
                  if (!canControl("reset-query")) return;
                  setDraftFilters({});
                  applySearch({}, "reset-query");
                }}
                type="button"
              >
                {t("common.reset")}
              </button>}
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
              {(
                [resource === "action" ? "matrix" : "cards", "table"] as const
              ).map((mode) => (
                <AButton
                  key={mode}
                  active={view === mode}
                  onClick={() => setView(mode)}
                >
                  {text(`system-insights.${mode}`)}
                </AButton>
              ))}
              {canControl("create") && (
                <button
                  className={`${buttonClass} bg-brand-500 text-white hover:bg-brand-600`}
                  onClick={() => openEditor()}
                  type="button"
                >
                  {t("common.create")}
                </button>
              )}
              {canControl("delete-selected") && checkedSelected.length > 0 && (
                <button
                  className={`${buttonClass} bg-error-500 text-white`}
                  onClick={() => void remove(checkedSelected, "delete-selected")}
                  type="button"
                >
                  {t("common.batchDelete")}
                </button>
              )}
            </div>
            <ResultToolbar
              canRefresh={canControl("refresh")}
              refresh={() => {
                if (!canControl("refresh")) return;
                setSummaryRevision((value) => value + 1);
                void load();
              }}
              density={tableDensity}
              setDensity={setTableDensity}
              fullscreen={isFullscreen}
              toggleFullscreen={() => setIsFullscreen((v) => !v)}
              columns={config.columns}
              visible={visibleColumnKeys}
              setVisible={setVisibleColumnKeys}
              settings={tableSettings}
              setSettings={setTableSettings}
            />
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
          {!canRead ? (
            <p className="p-8 text-center text-gray-500">
              {t("errors.noPermission")}
            </p>
          ) : view === "cards" ? (
            <ResourceCards
              resource={resource}
              records={records as unknown as AdminRecord[]}
              loading={loading}
              selected={checkedSelected}
              canSelectRecord={canSelectRecord}
              canEditRecord={record => manageableDefinition(record)}
              canDeleteRecord={record => canRemoveRecord(record)}
              onSelect={(id) => {
                if (!records.some(record => record.id === id && canSelectRecord(record as unknown as AdminRecord))) return;
                setSelected((old) =>
                  old.includes(id)
                    ? old.filter((value) => value !== id)
                    : [...old, id],
                );
              }}
              onDetail={canControl("view-detail") ? openDetail : undefined}
              onEdit={
                canControl("edit")
                  ? (record) => openEditor(record as unknown as SystemRecord)
                  : undefined
              }
              onDelete={canControl("delete") ? (id) => void remove([id]) : undefined}
              renderValue={(key, _value, record) =>
                renderValue(
                  record as unknown as SystemRecord,
                  key,
                  config.columns.find((column) => column.key === key)?.kind,
                )
              }
            />
          ) : (
            <div className="relative overflow-x-auto">
              <table
                data-testid="management-table"
                className="w-full text-start text-sm"
              >
                <thead
                  className={tableSettings.sticky ? "sticky top-0 z-20" : ""}
                >
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase dark:border-gray-800 dark:bg-gray-900">
                    <th
                      className={`${cellPadding} ${tableSettings.bordered ? "border-e border-gray-200 dark:border-gray-800" : ""}`}
                    >
                      <Checkbox
                        checked={allSelected}
                        disabled={!selectableRecords.length}
                        onChange={(checked) => {
                          if (!currentControl("delete-selected")) return;
                          setSelected(checked ? selectableRecords.map(record => record.id) : []);
                        }}
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
                    {canRead && (
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
                          checked={checkedSelected.includes(record.id)}
                          disabled={!canSelectRecord(record as unknown as AdminRecord)}
                          onChange={(checked) => {
                            if (!canSelectRecord(record as unknown as AdminRecord)) return;
                            setSelected((values) =>
                              checked
                                ? [...values, record.id]
                                : values.filter((id) => id !== record.id),
                            );
                          }}
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
                      {canRead && (
                        <td
                          className={`sticky end-0 z-10 min-w-52 border-s border-gray-100 bg-white align-top shadow-theme-sm group-hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:group-hover:bg-gray-900 ${cellPadding}`}
                        >
                          <div className="flex flex-wrap gap-2">
                            {canControl("view-detail") && <button
                              type="button"
                              className="text-brand-500"
                              onClick={() => openDetail(record as unknown as AdminRecord)}
                            >
                              {text("system-insights.details")}
                            </button>}
                            {canControl("approve") &&
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
                            {canControl("edit") && manageableDefinition(record as unknown as AdminRecord) && (
                              <button
                                className="text-brand-500"
                                onClick={() => openEditor(record)}
                              >
                                {t("common.edit")}
                              </button>
                            )}
                            {canControl("lock") &&
                              resource === "user" &&
                              (record as UserRecord).status === 1 && (
                                <button
                                  className="text-warning-600"
                                  onClick={() =>
                                    canControl("lock") && setLockUser(record as UserRecord)
                                  }
                                >
                                  {t("users.lock")}
                                </button>
                              )}
                            {canControl("unlock") &&
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
                            {canControl("unlock-password") &&
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
                            {canRemoveRecord(record as unknown as AdminRecord) && (
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

      <RecordDetail
        resource={resource}
        record={canControl("view-detail") ? detailRecord : undefined}
        canViewMembers={canControl("view-members")}
        onClose={() => setDetailRecord(undefined)}
        onEdit={
          canControl("edit")
            ? (record) => openEditor(record as unknown as SystemRecord)
            : undefined
        }
        renderValue={(key, _value, record) =>
          renderValue(
            record as unknown as SystemRecord,
            key,
            config.columns.find((column) => column.key === key)?.kind,
          )
        }
      />
      <AdminDrawer
        open={editorOpen}
        title={t(editing ? "common.editEntity" : "common.createEntity", {
          entity: t(config.entity),
        })}
        onClose={closeEditor}
        footer={
          <div className="flex justify-end gap-3">
            <button
              className={`${buttonClass} border border-gray-300 dark:border-gray-700`}
              onClick={closeEditor}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className={`${buttonClass} bg-brand-500 text-white`}
              disabled={submitting}
              type="submit"
              form="management-editor-form"
            >
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        }
      >
        <form
          id="management-editor-form"
          className="space-y-5"
          noValidate
          onSubmit={submitEditor}
        >
          {resource === "action" && <div className="grid gap-3 md:grid-cols-2">{actionLocales.map(locale => <Field key={locale.tag} title={locale.name} value={(form.names as Record<string,string> | undefined)?.[locale.tag] ?? ""} onChange={value => setForm(current => ({...current,names:{...(current.names as Record<string,string> ?? {}),[locale.tag]:value}}))} />)}</div>}
          {resource === "action" && <PermissionEditor key={`action-${editing?.id ?? "new"}`} definition config={form.config as never} bindings={form.action_bindings as ActionResourceBinding[] | undefined} onValidity={setPermissionValid} onChange={value => setForm(current => ({ ...current, action_bindings: value, ...(!editing && !current.word && value[0] ? {word: `${value[0].resource_key.split(":")[0]}:${value[0].operation}:${value[0].resource_key.split(":").slice(1).join(":")}`} : {}) }))} />}
          {config.fields.filter(field => (resource !== "action" || !["name", "resource", "menu", "button"].includes(field.key)) && (!editing || auth.user?.permission.permission_scope === "*" || !isExistingCredentialField(resource, field.key)) && (!isAssignmentField(resource, field.key) || auth.user?.permission.permission_scope === "*" || !!auth.user?.permission.permission_scopes?.includes(`${resource}:${editing ? "update" : "create"}`))).map((field) => {
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
                {field.key === "user_ids" &&
                editing &&
                resource === "user-group" ? (
                  <GroupMemberEditor
                    record={editing as unknown as AdminRecord}
                    added={memberAdded}
                    removed={memberRemoved}
                    onChange={(added, removed) => {
                      setMemberAdded(added);
                      setMemberRemoved(removed);
                    }}
                  />
                ) : field.type === "action-select" ? (
                  <PermissionEditor key={`${resource}-${editing?.id ?? "new"}`} codes={(form.action_codes as string[]) ?? []} bindings={form.action_bindings as ActionResourceBinding[] | undefined} disabled={!(auth.user?.permission.permission_scope === "*" || auth.user?.permission.permission_scopes?.includes(`${resource}:${editing ? "update" : "create"}`))} onValidity={setPermissionValid} onChange={value => setForm(current => ({ ...current, action_bindings: value }))} />
                ) : field.type === "user-select" ? (
                  <AssociationEditor
                    resource={
                      "user"
                    }
                    seed={
                      editing &&
                      ("users" in editing)
                        ? ((editing as { users: unknown }).users as AdminRecord[])
                        : []
                    }
                    value={(form[field.key] as Array<string | number>) ?? []}
                    onChange={(value) => updateForm(field, value)}
                  />
                ) : ["resource", "menu", "button"].includes(field.key) ? (
                  <RuleListEditor
                    label={t(field.label)}
                    value={String(form[field.key] ?? "")}
                    onChange={(value) => updateForm(field, value)}
                  />
                ) : field.type === "textarea" || field.type === "json" ? (
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
                    id={fieldId}
                    initialOptions={editorOptions[field.key]}
                    multiple={false}
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
        </form>
      </AdminDrawer>
      <Modal
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
        className="max-w-lg p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">
          {text("system-editor.discardTitle")}
        </h2>
        <div className="flex justify-end gap-2">
          <AButton onClick={() => setDiscardOpen(false)}>
            {text("system-editor.continue")}
          </AButton>
          <AButton
            onClick={() => {
              setDiscardOpen(false);
              setEditorOpen(false);
            }}
          >
            {text("system-editor.discard")}
          </AButton>
        </div>
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

import { auditDetailFields } from "./list-fields";
import { systemDetailFields } from "@/api/system";
import { apiRequest as request } from "@/api/client";
import {
  queryText,
  summaryFields,
  type AdminResource,
  type AdminQuery,
  type AdminRecord,
  type AdminSummary,
  type AdminPage,
  type AuditEvent,
  type AuditSummary,
} from "./model";
export function getAdminSummary(
  resource: AdminResource,
  params: AdminQuery = {},
) {
  return request<Partial<AdminSummary>>(
    `/${resource}/summary?${queryText({ ...params, f: summaryFields[resource] })}`,
  ).then(
    (value) =>
      ({
        total: 0,
        counts: {},
        groups: [],
        trend: [],
        ...value,
      }) as AdminSummary,
  );
}
export function getAdminRecord(resource: AdminResource, id: number) {
  return request<AdminRecord>(
    `/${resource}/${id}${systemDetailFields[resource] ? `?f=${systemDetailFields[resource]}` : ""}`,
  );
}
export function getGroupMembers(id: number, params: AdminQuery) {
  return request<AdminPage>(`/user-group/${id}/member?${queryText(params)}`);
}
export function associationOptions(
  resource: "user" | "action" | "role",
  params: AdminQuery,
) {
  const f =
    resource === "user"
      ? "id,username,code"
      : resource === "role"
        ? "id,name,word"
        : "id,name,word,code,group,resource,menu,button";
  return request<AdminPage>(
    `/${resource}?${queryText({ p: 1, s: 20, ...params, f })}`,
  );
}
export function getAuditList(kind: "login" | "operation", params: AdminQuery) {
  return request<AdminPage<AuditEvent>>(`/audit/${kind}?${queryText(params)}`);
}
export function getAuditSummary(
  kind: "login" | "operation",
  params: AdminQuery & { f: string },
) {
  return request<AuditSummary>(`/audit/${kind}/summary?${queryText(params)}`);
}
export function getAuditDetail(kind: "login" | "operation", id: number) {
  return request<AuditEvent>(`/audit/${kind}/detail/${id}?f=${auditDetailFields[kind]}`);
}

export function exportAudit(kind: "login" | "operation", params: AdminQuery) {
  return request<string>(`/audit/${kind}/export?${queryText(params)}`);
}

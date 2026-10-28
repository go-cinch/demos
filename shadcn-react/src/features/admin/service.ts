import { auditDetailFields } from './field-selectors';
import { request } from '@/features/auth/api';
import {
  queryText,
  summaryFields,
  memberFields,
  type AdminResource,
  type AdminQuery,
  type AdminRecord,
  type AdminSummary,
  type AdminPage,
  type AuditEvent,
  type AuditSummary
} from './model';
export function getAdminSummary(resource: AdminResource, params: AdminQuery = {}) {
  return request<Partial<AdminSummary>>(
    `/${resource}/summary?${queryText({ ...params, f: summaryFields[resource] })}`
  ).then((value) => ({ total: 0, counts: {}, groups: [], trend: [], ...value }) as AdminSummary);
}
export function getAdminRecord(resource: AdminResource, id: number, mode: 'detail' | 'edit' = 'detail') {
  const fields: Record<string, string> = {
    action: mode === 'edit' ? 'id,name,names,group,word,scope,config'
      : 'id,created_at,updated_at,code,name,group,word,config,resource,menu,button',
    role: 'id,created_at,updated_at,name,word,action_codes,actions',
    user: 'id,created_at,updated_at,username,code,role_id,role_summary,last_logged_in_at,login_count,status,metadata,wrong,action_codes,actions,permission_sources',
    'user-group': memberFields,
    dictionary: 'id,created_at,updated_at,name,key,value,description,enabled'
  };
  return request<AdminRecord>(
    `/${resource}/${id}${fields[resource] ? `?f=${fields[resource]}` : ''}`
  );
}
export function getGroupMembers(id: number, params: AdminQuery) {
  return request<AdminPage>(`/user-group/${id}/member?${queryText(params)}`);
}
export function associationOptions(resource: 'user' | 'action' | 'role', params: AdminQuery) {
  const f =
    resource === 'user'
      ? 'id,username,code'
      : resource === 'role'
        ? 'id,name,word'
        : 'id,name,word,code,group,resource,menu,button';
  return request<AdminPage>(`/${resource}?${queryText({ p: 1, s: 20, ...params, f })}`);
}
export function getAuditList(kind: 'login' | 'operation', params: AdminQuery) {
  return request<AdminPage<AuditEvent>>(`/audit/${kind}?${queryText(params)}`);
}
export function getAuditSummary(kind: 'login' | 'operation', params: AdminQuery & { f: string }) {
  return request<AuditSummary>(`/audit/${kind}/summary?${queryText(params)}`);
}
export function getAuditDetail(kind: 'login' | 'operation', id: number) {
  return request<AuditEvent>(`/audit/${kind}/detail/${id}?f=${auditDetailFields[kind]}`);
}

export function exportAudit(kind: 'login' | 'operation', params: AdminQuery) {
  return request<string>(`/audit/${kind}/export?${queryText(params)}`);
}

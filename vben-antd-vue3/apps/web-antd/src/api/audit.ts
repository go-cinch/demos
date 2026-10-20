import type { PageResult, SelectedRecord } from './system';

import { authRequestClient as client } from '#/api/request';
export type AuditKind = 'login' | 'operation';
export type AuditPayload =
  | AuditPayload[]
  | boolean
  | null
  | number
  | string
  | { [key: string]: AuditPayload };
export interface AuditEvent {
  operation: string;
  resource_type: string;
  resource_id: string;
  request_params: AuditPayload;
  response_params: AuditPayload;
  id: number;
  kind: AuditKind;
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
}
// List rows contain only the fields needed by the current view. Details remain complete.
export type AuditPreview = Partial<AuditEvent> & Pick<AuditEvent, 'id' | 'occurred_at'>;
export const auditProfileFields = {
  login: 'id,occurred_at,username,status,user_agent,ip,duration_ms',
  operation: 'id,occurred_at,username,status,user_agent,ip,duration_ms,module,method,path,operation,resource_id',
} as const;
// The detail view has no header snapshot or numeric actor-ID UI. Operation
// payloads are needed only for operation details, not login attempts.
export const auditDetailFields = {
  login: 'id,occurred_at,kind,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms',
  operation: 'id,occurred_at,kind,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms,operation,resource_type,resource_id,request_params,response_params',
} as const;
export interface AuditBreakdown {
  name: string;
  total: number;
  failed: number;
}
export interface AuditHeatCell {
  started_at: number;
  ended_at: number;
  weekday: number;
  hour: number;
  count: number;
  failed: number;
}
export interface AuditSummary {
  heatmap_granularity?: 'day' | 'hour';
  bucket_ms?: number;
  accounts?: AuditBreakdown[];
  sources?: AuditBreakdown[];
  total?: number;
  success?: number;
  failed?: number;
  unique_users?: number;
  unique_ips?: number;
  average_ms?: number;
  p95_ms?: number;
  success_rate?: number;
  from: number;
  to: number;
  trend?: { at: number; success: number; failure: number }[];
  heatmap?: AuditHeatCell[];
  modules?: { name: string; total: number; failed: number }[];
  repeated_failures?: { name: string; total: number; failed: number }[];
}
export type AuditParams = Record<string, number | string>;
function listAudit<F extends string>(kind: AuditKind, params: AuditParams & { f: F }): Promise<PageResult<SelectedRecord<AuditEvent, F>>>;
function listAudit(kind: AuditKind, params: AuditParams): Promise<PageResult<AuditEvent>>;
function listAudit(kind: AuditKind, params: AuditParams) {
  return client.get<PageResult<AuditEvent>>(`/audit/${kind}`, { params });
}
function getAudit<K extends AuditKind>(kind: K, id: number) {
  return client.get<SelectedRecord<AuditEvent, (typeof auditDetailFields)[K]>>(
    `/audit/${kind}/detail/${id}`,
    { params: { f: auditDetailFields[kind] } },
  );
}
export const auditApi = {
  list: listAudit,
  summary: (kind: AuditKind, params: AuditParams & { f: string }) =>
    client.get<AuditSummary>(`/audit/${kind}/summary`, { params }),
  options: (kind: AuditKind, params: AuditParams) =>
    client.get<string[]>(`/audit/${kind}/option`, { params }),
  get: getAudit,
  export: (kind: AuditKind, params: AuditParams) =>
    client.get<Blob>(`/audit/${kind}/export`, { params, responseType: 'blob' }),
};

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
export const auditApi = {
  list: listAudit,
  summary: (kind: AuditKind, params: AuditParams & { f: string }) =>
    client.get<AuditSummary>(`/audit/${kind}/summary`, { params }),
  options: (kind: AuditKind, params: AuditParams) =>
    client.get<string[]>(`/audit/${kind}/option`, { params }),
  get: (kind: AuditKind, id: number) =>
    client.get<AuditEvent>(`/audit/${kind}/detail/${id}`),
  export: (kind: AuditKind, params: AuditParams) =>
    client.get<Blob>(`/audit/${kind}/export`, { params, responseType: 'blob' }),
};

import type { PageResult, SelectedRecord } from './system';

import type { ServiceRequestConfig } from '#/api/request-types';

import { authRequestClient as client } from '#/api/request';
import { quietRequest } from '#/api/request-types';
export type AuditKind = 'login' | 'operation';
export type AuditPayload =
  | AuditPayload[]
  | boolean
  | null
  | number
  | string
  | { [key: string]: AuditPayload };
export type AuditOutcome = 'failure' | 'mfa_challenge' | 'success';
export interface AuditEvent {
  outcome: AuditOutcome;
  step_up_fingerprint?: string;
  step_up_verified_at?: number;
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
export type AuditPreview = Partial<AuditEvent> &
  Pick<AuditEvent, 'id' | 'occurred_at'>;
export const auditProfileFields = {
  login:
    'id,occurred_at,username,status,user_agent,ip,duration_ms,outcome,operation',
  operation:
    'id,occurred_at,username,status,user_agent,ip,duration_ms,module,method,path,operation,resource_id',
} as const;
// Details use the recorded actor ID for investigation. Operation
// payloads are needed only for operation details, not login attempts.
export const auditDetailFields = {
  login:
    'id,occurred_at,kind,user_id,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms,outcome,operation',
  operation:
    'id,occurred_at,kind,user_id,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms,operation,resource_type,resource_id,request_params,response_params,step_up_fingerprint,step_up_verified_at',
} as const;
export interface AuditBreakdown {
  name: string;
  total: number;
  failed: number;
}
export interface AuditHeatCell {
  mfa_challenge?: number;
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
  trend?: {
    at: number;
    ended_at?: number;
    success: number;
    failure: number;
    mfa_challenge?: number;
  }[];
  heatmap?: AuditHeatCell[];
  modules?: { name: string; total: number; failed: number }[];
  repeated_failures?: { name: string; total: number; failed: number }[];
}
export type AuditParams = Record<string, number | string>;
function listAudit<F extends string>(
  kind: AuditKind,
  params: AuditParams & { f: F },
): Promise<PageResult<SelectedRecord<AuditEvent, F>>>;
function listAudit(
  kind: AuditKind,
  params: AuditParams,
): Promise<PageResult<AuditEvent>>;
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
    client.get<AuditSummary>(`/audit/${kind}/summary`, {
      ...quietRequest,
      params,
    }),
  options: (kind: AuditKind, params: AuditParams) =>
    client.get<string[]>(`/audit/${kind}/option`, { params }),
  get: getAudit,
  export: (kind: AuditKind, params: AuditParams) => {
    const config: ServiceRequestConfig = {
      params,
      responseType: 'blob',
      suppressErrorMessage: true,
    };
    return client.get<Blob>(`/audit/${kind}/export`, config);
  },
};

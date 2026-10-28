export const auditProfileFields = {
  login: 'id,occurred_at,username,status,user_agent,ip,duration_ms',
  operation: 'id,occurred_at,username,status,user_agent,ip,duration_ms,module,method,path,operation,resource_id'
} as const;
export const auditDetailFields = {
  login: 'id,occurred_at,kind,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms',
  operation: 'id,occurred_at,kind,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms,operation,resource_type,resource_id,request_params,response_params'
} as const;
export function auditListFields(kind: 'login' | 'operation', columns: readonly string[]) {
  return [...new Set(['id', 'occurred_at', ...(kind === 'operation' ? ['module', 'method', 'path'] : []),
    ...columns.map((key) => key === 'client' ? 'user_agent' : key)])].join(',');
}

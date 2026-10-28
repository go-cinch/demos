import type { ResourceKind } from '@/api/system';

export const defaultUserColumns = ['username', 'role', 'status', 'login_count', 'last_logged_in_at', 'metadata'];
const base: Record<ResourceKind, string[]> = {
  user: ['id', 'username', 'code', 'status', 'metadata'],
  action: ['id', 'name', 'word', 'config'],
  role: ['id', 'name', 'word'],
  'user-group': ['id', 'name', 'word'],
  dictionary: ['id', 'name', 'key'],
  whitelist: ['id', 'category'],
};
const cards: Partial<Record<ResourceKind, string[]>> = {
  role: ['action_summaries', 'created_at', 'updated_at'],
  'user-group': ['action_summaries', 'member_count', 'member_preview', 'created_at', 'updated_at'],
  dictionary: ['enabled', 'description', 'value', 'created_at', 'updated_at'],
  // Tail's optional user cards display login and direct-assignment counts.
  user: ['action_codes', 'login_count', 'updated_at'],
  whitelist: ['resource', 'enabled', 'created_at', 'updated_at'],
};
export function systemListFields(resource: ResourceKind, view: string, visible: string[], protectDeletion = false) {
  const columns = resource === 'action' && view === 'matrix' ? [] : view === 'cards' ? cards[resource] ?? []
    : visible.flatMap(key => key === 'role' ? ['role_summary'] : key === 'users' ? ['member_count', 'member_preview'] : [key]);
  const deletion = protectDeletion && ['role', 'user-group'].includes(resource) ? ['action_codes', ...(resource === 'user-group' ? ['member_count'] : [])] : [];
  return [...new Set([...base[resource], ...columns, ...deletion])].join(',');
}
export const messagePreviewFields = 'id,title,summary,type,published_at,read_at';
export const sentMessageDetailFields = 'id,title,content,type,scope,sender_id,published_at,expired_at,read_at,recipients';
export function messageListFields(sent: boolean, visible: string[], view: string) {
  return [...new Set(['id', 'title', ...visible, ...(sent ? ['expired_at'] : ['read_at']), ...(sent && view === 'split' ? ['summary'] : [])])].join(',');
}
export const auditProfileFields = {
  login: 'id,occurred_at,username,status,user_agent,ip,duration_ms',
  operation: 'id,occurred_at,username,status,user_agent,ip,duration_ms,module,method,path,operation,resource_id',
};
export const auditDetailFields = {
  login: 'id,occurred_at,kind,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms',
  operation: 'id,occurred_at,kind,username,module,method,path,ip,user_agent,trace_id,error_code,status,duration_ms,operation,resource_type,resource_id,request_params,response_params',
};
export function auditListFields(kind: 'login' | 'operation', visible: string[]) {
  return [...new Set(['id', 'occurred_at', ...(kind === 'operation' ? ['module', 'method', 'path'] : []), ...visible.map(key => key === 'client' ? 'user_agent' : key)])].join(',');
}

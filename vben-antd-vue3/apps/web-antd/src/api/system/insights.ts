import { authRequestClient } from '#/api/request';

export type SystemResource =
  | 'action'
  | 'dictionary'
  | 'role'
  | 'user'
  | 'user-group'
  | 'whitelist';

export interface SystemSummaryGroup {
  id?: number;
  name: string;
  count: number;
}

export interface SystemSummaryDay {
  date: string;
  from: number;
  to: number;
  count: number;
  recent_logged_in_users: number;
}

export interface SystemSummary {
  total: number;
  counts: Record<string, number>;
  groups: SystemSummaryGroup[];
  trend: SystemSummaryDay[];
}

export function getSystemSummary(
  resource: SystemResource,
  params: { days?: number; time_zone?: string } = {},
) {
  const fields: Record<SystemResource, string> = {
    action: 'total,counts,groups',
    dictionary: 'total,counts',
    role: 'total,counts,groups',
    user: 'total,counts,trend',
    'user-group': 'total,counts,groups',
    whitelist: 'total,counts',
  };
  return authRequestClient.get<Partial<SystemSummary>>(`/${resource}/summary`, {
    params: { ...params, f: fields[resource] },
  }).then((value): SystemSummary => ({
    total: 0, counts: {}, groups: [], trend: [], ...value,
  }));
}

export function getSummaryUserGroup(id: number) {
  return authRequestClient.get<import('./index').UserGroupRecord>(
    `/user-group/${id}`,
    { params: { f: 'actions,member_count,member_preview' } },
  );
}

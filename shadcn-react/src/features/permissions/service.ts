import { request } from '@/features/auth/api';
import type { PermissionCatalog, ActionRecord } from './types';
export const getPermissionCatalog = () =>
  request<PermissionCatalog>(
    '/action/catalog?f=scopes,operations,resource_catalog,defined_actions'
  );
export async function hydrateActions(codes: string[]) {
  const actions = new Map<string, ActionRecord>();
  for (let start = 0; start < codes.length; start += 100) {
    const code = `${codes.slice(start, start + 100).join(',')},`;
    for (let p = 1; ; p++) {
      const result = await request<{ items: ActionRecord[]; t: number; s: number; p: number }>(
        `/action?${new URLSearchParams({ code, f: 'id,code,word,config', p: String(p), s: '100' })}`
      );
      result.items.forEach((action) => actions.set(action.code, action));
      if (result.p * result.s >= result.t) break;
    }
  }
  return actions;
}

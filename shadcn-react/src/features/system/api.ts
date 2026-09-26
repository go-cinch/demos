import { createPasswordCredential, request } from '@/features/auth/api';
import type { PageResult, ResourceKind, SystemRecord } from './types';

export async function listRecords(
  resource: ResourceKind,
  params: Record<string, string | number | boolean | undefined>
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return request<PageResult>(`/${resource}?${query}`);
}

export async function createRecord(resource: ResourceKind, payload: Record<string, unknown>) {
  let body = payload;
  if (resource === 'user' && typeof payload.password === 'string') {
    const { password, ...rest } = payload;
    body = {
      ...rest,
      ...(await createPasswordCredential(password)),
      username: String(payload.username).trim()
    };
  }
  return request<SystemRecord>(`/${resource}`, {
    method: 'POST',
    headers: { 'x-idempotent': crypto.randomUUID() },
    body: JSON.stringify(body)
  });
}

export async function updateRecord(
  resource: ResourceKind,
  id: number,
  payload: Record<string, unknown>
) {
  let body = payload;
  if (resource === 'user') {
    const { password, ...rest } = payload;
    body =
      typeof password === 'string' && password
        ? { ...rest, ...(await createPasswordCredential(password)) }
        : rest;
  }
  return request<SystemRecord>(`/${resource}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export const deleteRecords = (resource: ResourceKind, ids: number[]) =>
  request(`/${resource}/${ids.join(',')}`, { method: 'DELETE' });

export async function listActionGroups(keyword = '') {
  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
  return request<{ items: string[] }>(`/action/group${query}`);
}

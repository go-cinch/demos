import { authClient, createPasswordCredential } from './auth-service'

export interface PageResult<T> {
  items: T[]
  p: number
  s: number
  t: number
}
export interface ActionRecord {
  id: number
  name: string
  group: string
  word: string
  code: string
  resource: string
  menu: string
  button: string
  created_at: number
  updated_at: number
}
export interface RoleRecord {
  id: number
  name: string
  word: string
  action_codes: string[]
  actions: ActionRecord[]
  created_at: number
  updated_at: number
}
export interface UserRecord {
  id: number
  username: string
  code: string
  role_id?: number
  role?: RoleRecord
  action_codes: string[]
  actions: ActionRecord[]
  status: 0 | 1 | 2
  metadata: Record<string, unknown>
  wrong: number
  login_count: number
  last_logged_in_at?: number
  created_at: number
  updated_at: number
}
export interface UserGroupRecord {
  id: number
  name: string
  word: string
  action_codes: string[]
  actions: ActionRecord[]
  users: Array<{ id: number; username: string; code: string }>
  created_at: number
  updated_at: number
}
export interface DictionaryRecord {
  id: number
  key: string
  name: string
  value: unknown
  description: string
  enabled: boolean
  created_at: number
  updated_at: number
}
export interface WhitelistRecord {
  id: number
  category: 0 | 1
  resource: string
  created_at: number
  updated_at: number
}
export type SystemRecord =
  | ActionRecord
  | RoleRecord
  | UserRecord
  | UserGroupRecord
  | DictionaryRecord
  | WhitelistRecord
export type ResourceKind = 'action' | 'role' | 'user' | 'user-group' | 'dictionary' | 'whitelist'
export type Payload = Record<string, unknown>

export async function listResource<T extends SystemRecord>(
  resource: ResourceKind,
  params: Record<string, unknown> = {}
) {
  return (await authClient.get<PageResult<T>>(`/${resource}`, { params })).data
}

export async function createResource<T extends SystemRecord>(
  resource: ResourceKind,
  payload: Payload
) {
  let body = { ...payload }
  if (resource === 'user') {
    const password = String(body.password || '')
    delete body.password
    body = { ...body, ...(await createPasswordCredential(password)) }
  }
  return (
    await authClient.post<T>(`/${resource}`, body, {
      headers: { 'x-idempotent': crypto.randomUUID() }
    })
  ).data
}

export async function updateResource<T extends SystemRecord>(
  resource: ResourceKind,
  id: number,
  payload: Payload
) {
  let body = { ...payload }
  if (resource === 'user' && body.password) {
    const password = String(body.password)
    delete body.password
    body = { ...body, ...(await createPasswordCredential(password)) }
  } else if (resource === 'user') {
    delete body.password
  }
  return (await authClient.patch<T>(`/${resource}/${id}`, body)).data
}

export async function deleteResources(resource: ResourceKind, ids: number[]) {
  await authClient.delete(`/${resource}/${ids.join(',')}`)
}

export async function actionGroups(keyword = '') {
  return (
    await authClient.get<{ items: string[] }>('/action/group', {
      params: keyword ? { keyword } : {}
    })
  ).data.items
}

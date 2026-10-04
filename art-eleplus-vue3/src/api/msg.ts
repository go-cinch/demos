import { authClient as client } from './auth-service'
export interface Msg {
  id: number
  title: string
  content: string
  type: 'system' | 'notice'
  scope: 'all' | 'targeted'
  sender_id: number | null
  published_at: number
  expired_at: number | null
  read_at: number | null
  recipient_ids?: number[]
}
export interface MsgPage {
  items: Msg[]
  t: number
  p: number
  s: number
}
export interface MsgInput {
  title: string
  content: string
  type: 'system' | 'notice'
  scope: 'all' | 'targeted'
  recipient_ids?: number[]
  expired_at: number | null
}
export interface MsgUser {
  id: number
  username: string
}

export function msgChanged() {
  window.dispatchEvent(new Event('cinch-msg-changed'))
}
export const msgApi = {
  list: async (sent: boolean, params: Record<string, string | number | boolean>) =>
    (await client.get<MsgPage>(sent ? '/msg/sent' : '/msg/inbox', { params })).data,
  get: async (id: number, sent: boolean) =>
    (await client.get<Msg>(`/msg/${sent ? 'sent' : 'inbox'}/${id}`)).data,
  count: async () => (await client.get<{ count: number }>('/msg/unread-count')).data,
  read: (id: number) => client.patch(`/msg/inbox/${id}`, { read: true }),
  readAll: () => client.post('/msg/inbox/read-all'),
  remove: (id: number, sent: boolean) => client.delete(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  send: async (body: MsgInput, key: string) =>
    (await client.post<Msg>('/msg', body, { headers: { 'x-idempotent': key } })).data,
  users: async (q: string) =>
    (await client.get<MsgUser[]>('/msg/recipient-option', { params: { q } })).data
}

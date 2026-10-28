import { MessageStatusRequest } from './message-status-request'
import type { MessageStatus } from '@/utils/message-attention'
import { authClient as client } from './auth-service'
export interface Msg {
  id: number
  title: string
  content?: string
  summary?: string
  recipients?: Array<{ id: number; username: string; code: string }>
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
export const msgPreviewFields = 'id,title,summary,type,published_at,read_at'
export const msgSentDetailFields =
  'id,title,content,type,scope,sender_id,published_at,expired_at,read_at,recipients'

const rawMsgApi = {
  sentSummary: async () =>
    (await client.get<MsgSentSummary>('/msg/sent/summary', { params: { f: 'total,counts' } })).data,
  list: async (sent: boolean, params: Record<string, string | number | boolean>) =>
    (
      await client.get<MsgPage>(sent ? '/msg/sent' : '/msg/inbox', {
        params: {
          f: msgPreviewFields,
          ...params
        }
      })
    ).data,
  get: async (id: number, sent: boolean) =>
    (
      await client.get<Msg>(`/msg/${sent ? 'sent' : 'inbox'}/${id}`, {
        params: sent ? { f: msgSentDetailFields } : undefined
      })
    ).data,
  count: async () => (await client.get<MessageStatus>('/msg/unread-count')).data,
  read: (id: number) => client.patch(`/msg/inbox/${id}`, { read: true }),
  readAll: () => client.post('/msg/inbox/read-all'),
  remove: (id: number, sent: boolean) => client.delete(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  send: async (body: MsgInput, key: string) =>
    (await client.post<Msg>('/msg', body, { headers: { 'x-idempotent': key } })).data,
  users: async (q: string) =>
    (await client.get<MsgUser[]>('/msg/recipient-option', { params: { q } })).data
}

const statusRequest = new MessageStatusRequest<MessageStatus>()
async function changed<T>(operation: Promise<T>): Promise<T> {
  const result = await operation
  statusRequest.invalidate()
  return result
}
export const msgApi = {
  ...rawMsgApi,
  count: (user: number | undefined) => statusRequest.get(user, rawMsgApi.count),
  read: (...args: Parameters<typeof rawMsgApi.read>) => changed(rawMsgApi.read(...args)),
  readAll: () => changed(rawMsgApi.readAll()),
  remove: (...args: Parameters<typeof rawMsgApi.remove>) => changed(rawMsgApi.remove(...args)),
  send: (...args: Parameters<typeof rawMsgApi.send>) => changed(rawMsgApi.send(...args))
}

export interface MsgSentSummary {
  total: number
  counts: {
    notice: number
    system: number
    all: number
    targeted: number
    latest_published_at: number | null
  }
}

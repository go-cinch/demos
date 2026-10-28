import { MessageStatusRequest } from './message-status-request';
import type { MessageStatus } from '../message-attention';
import { request } from '@/features/auth/api';
import type { Msg, MsgPage, MsgInput, MsgUser, MsgSentSummary } from './types';
export type { Msg, MsgPage, MsgInput, MsgUser, MsgSentSummary } from './types';

export function msgChanged() {
  window.dispatchEvent(new Event('cinch-msg-changed'));
}
export const msgPreviewFields = 'id,title,summary,type,published_at,read_at';
export const msgSentDetailFields = 'id,title,content,type,scope,sender_id,published_at,expired_at,read_at,recipients';
const rawMsgApi = {
  sentSummary: () => request<MsgSentSummary>('/msg/sent/summary?f=total,counts'),
  list: (sent: boolean, params: Record<string, string | number | boolean>) =>
    request<MsgPage>(
      `${sent ? '/msg/sent' : '/msg/inbox'}?${new URLSearchParams(Object.entries({ f: msgPreviewFields, ...params }).map(([k, v]) => [k, String(v)]))}`
    ),
  get: (id: number, sent: boolean) => request<Msg>(`/msg/${sent ? 'sent' : 'inbox'}/${id}${sent ? `?f=${msgSentDetailFields}` : ''}`),
  count: () => request<MessageStatus>('/msg/unread-count'),
  read: (id: number) =>
    request(`/msg/inbox/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ read: true })
    }),
  readAll: () => request('/msg/inbox/read-all', { method: 'POST' }),
  remove: (id: number, sent: boolean) =>
    request(`/msg/${sent ? 'sent' : 'inbox'}/${id}`, { method: 'DELETE' }),
  send: (body: MsgInput, key: string) =>
    request<Msg>('/msg', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'x-idempotent': key }
    }),
  users: (q: string) => request<MsgUser[]>(`/msg/recipient-option?q=${encodeURIComponent(q)}`)
};

const statusRequest = new MessageStatusRequest<MessageStatus>();
async function changed<T>(operation: Promise<T>): Promise<T> {
  const result = await operation;
  statusRequest.invalidate();
  return result;
}
export const msgApi = {
  ...rawMsgApi,
  count: (user: number | undefined) => statusRequest.get(user, rawMsgApi.count),
  read: (...args: Parameters<typeof rawMsgApi.read>) => changed(rawMsgApi.read(...args)),
  readAll: () => changed(rawMsgApi.readAll()),
  remove: (...args: Parameters<typeof rawMsgApi.remove>) => changed(rawMsgApi.remove(...args)),
  send: (...args: Parameters<typeof rawMsgApi.send>) => changed(rawMsgApi.send(...args))
};

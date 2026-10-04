import { request } from '@/features/auth/api';
import type { Msg, MsgPage, MsgInput, MsgUser } from './types';
export type { Msg, MsgPage, MsgInput, MsgUser } from './types';

export function msgChanged() {
  window.dispatchEvent(new Event('cinch-msg-changed'));
}
export const msgApi = {
  list: (sent: boolean, params: Record<string, string | number | boolean>) =>
    request<MsgPage>(
      `${sent ? '/msg/sent' : '/msg/inbox'}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`
    ),
  get: (id: number, sent: boolean) => request<Msg>(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  count: () => request<{ count: number }>('/msg/unread-count'),
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

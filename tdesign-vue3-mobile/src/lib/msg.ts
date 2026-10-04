import { request } from './api';
export interface Msg {
  id: number;
  title: string;
  content: string;
  type: 'system' | 'notice';
  scope: 'all' | 'targeted';
  sender_id: number | null;
  published_at: number;
  expired_at: number | null;
  read_at: number | null;
  recipient_ids?: number[];
}
export interface MsgPage {
  items: Msg[];
  t: number;
  p: number;
  s: number;
}
export interface MsgInput {
  title: string;
  content: string;
  type: 'system' | 'notice';
  scope: 'all' | 'targeted';
  recipient_ids?: number[];
  expired_at: number | null;
}
export interface MsgUser {
  id: number;
  username: string;
}
export function msgChanged() {
  window.dispatchEvent(new Event('cinch-msg-changed'));
}

export const msgApi = {
  list: (sent: boolean, params: Record<string, string | number | boolean>) =>
    request<MsgPage>(
      `${sent ? '/msg/sent' : '/msg/inbox'}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`,
    ),
  get: (id: number, sent: boolean) => request<Msg>(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  count: () => request<{ count: number }>('/msg/unread-count'),
  read: (id: number) => request(`/msg/inbox/${id}`, { method: 'PATCH', body: { read: true } }),
  readAll: () => request('/msg/inbox/read-all', { method: 'POST' }),
  remove: (id: number, sent: boolean) =>
    request(`/msg/${sent ? 'sent' : 'inbox'}/${id}`, { method: 'DELETE' }),
  send: (body: MsgInput, key: string) =>
    request<Msg>('/msg', { method: 'POST', body, headers: { 'x-idempotent': key } }),
  users: (q: string) => request<MsgUser[]>(`/msg/recipient-option?q=${encodeURIComponent(q)}`),
};

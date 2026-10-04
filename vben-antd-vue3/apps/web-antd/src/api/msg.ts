import { authRequestClient as client } from '#/api/request';
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
    client.get<MsgPage>(sent ? '/msg/sent' : '/msg/inbox', { params }),
  get: (id: number, sent: boolean) => client.get<Msg>(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  count: () => client.get<{ count: number }>('/msg/unread-count'),
  read: (id: number) =>
    client.request(`/msg/inbox/${id}`, { method: 'PATCH', data: { read: true } }),
  readAll: () => client.post('/msg/inbox/read-all'),
  remove: (id: number, sent: boolean) => client.delete(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  send: (data: MsgInput, key: string) =>
    client.post<Msg>('/msg', data, { headers: { 'x-idempotent': key } }),
  users: (q: string) => client.get<MsgUser[]>('/msg/recipient-option', { params: { q } }),
};

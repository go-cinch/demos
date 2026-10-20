import type { MessageStatus } from './message-attention';
import type { SelectedRecord } from './system';

import { authRequestClient as client } from '#/api/request';

import { MessageStatusRequest } from './message-status-request';
export interface MsgRecipient {
  id: number;
  username: string;
  code: string;
}
export interface Msg {
  id: number;
  title: string;
  content?: string;
  summary?: string;
  type: 'notice' | 'system';
  scope: 'all' | 'targeted';
  sender_id: null | number;
  published_at: number;
  expired_at: null | number;
  read_at: null | number;
  recipient_ids?: number[];
  recipients?: MsgRecipient[];
}
export type MsgFeedPreview = Pick<Msg, 'content' | 'id' | 'published_at' | 'read_at' | 'summary' | 'title' | 'type'>;
export type MsgPreview = Partial<Msg> & Pick<Msg, 'id' | 'title'>;
export interface MsgPage<T = Msg> {
  items: T[];
  t: number;
  p: number;
  s: number;
}
export interface MsgSentSummary {
  total: number;
  counts: {
    notice: number;
    system: number;
    all: number;
    targeted: number;
    latest_published_at: null | number;
  };
}
export interface MsgInput {
  title: string;
  content: string;
  type: 'notice' | 'system';
  scope: 'all' | 'targeted';
  recipient_ids?: number[];
  expired_at: null | number;
}
export interface MsgUser {
  id: number;
  username: string;
}
export function msgChanged() {
  window.dispatchEvent(new Event('cinch-msg-changed'));
}

export const msgPreviewFields = 'id,title,summary,type,published_at,read_at';
export const msgSentDetailFields = 'id,title,content,type,scope,sender_id,published_at,expired_at,read_at,recipients';
interface MsgListApi {
  <F extends string>(sent: boolean, params: Record<string, boolean | number | string> & { f: F }): Promise<MsgPage<SelectedRecord<Msg, F>>>;
  (sent: boolean, params: Record<string, boolean | number | string> & { f: string }): Promise<MsgPage<MsgPreview>>;
}
const listMessages: MsgListApi = (sent: boolean, params: Record<string, boolean | number | string>) =>
  client.get<MsgPage>(sent ? '/msg/sent' : '/msg/inbox', { params });
const rawMsgApi = {
  list: listMessages,
  sentSummary: () => client.get<MsgSentSummary>('/msg/sent/summary', { params: { f: 'total,counts' } }),
  get: (id: number, sent: boolean) => sent
    ? client.get<Msg>(`/msg/sent/${id}`, { params: { f: msgSentDetailFields } })
    : client.get<Msg>(`/msg/inbox/${id}`),
  count: () => client.get<MessageStatus>('/msg/unread-count'),
  read: (id: number) =>
    client.request(`/msg/inbox/${id}`, { method: 'PATCH', data: { read: true } }),
  readAll: () => client.post('/msg/inbox/read-all'),
  remove: (id: number, sent: boolean) => client.delete(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  send: (data: MsgInput, key: string) =>
    client.post<Msg>('/msg', data, { headers: { 'x-idempotent': key } }),
  users: (q: string) => client.get<MsgUser[]>('/msg/recipient-option', { params: { q } }),
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
  send: (...args: Parameters<typeof rawMsgApi.send>) => changed(rawMsgApi.send(...args)),
};

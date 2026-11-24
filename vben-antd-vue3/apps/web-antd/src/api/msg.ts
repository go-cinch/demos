import type { MessageStatus } from './message-attention';
import type { RequestErrorFeedback } from './request-types';
import type { SelectedRecord } from './system';

import { userCache } from '@vben/utils/cache';

import { messagesChangedEvent } from '#/api/message-events';
import { authRequestClient as client } from '#/api/request';
import { VerificationCancelled } from '#/security/verification-prompt';

import { MessageStatusRequest } from './message-status-request';
import { quietRequest } from './request-types';
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
export type MsgFeedPreview = Pick<
  Msg,
  'content' | 'id' | 'published_at' | 'read_at' | 'summary' | 'title' | 'type'
>;
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
  window.dispatchEvent(new Event(messagesChangedEvent));
}

export const msgPreviewFields = 'id,title,summary,type,published_at,read_at';
export const msgSentDetailFields =
  'id,title,content,type,scope,sender_id,published_at,expired_at,read_at,recipients';
interface MsgListApi {
  <F extends string>(
    sent: boolean,
    params: Record<string, boolean | number | string> & { f: F },
    feedback?: RequestErrorFeedback,
  ): Promise<MsgPage<SelectedRecord<Msg, F>>>;
  (
    sent: boolean,
    params: Record<string, boolean | number | string> & { f: string },
    feedback?: RequestErrorFeedback,
  ): Promise<MsgPage<MsgPreview>>;
}
const listMessages: MsgListApi = (
  sent: boolean,
  params: Record<string, boolean | number | string>,
  feedback?: RequestErrorFeedback,
) =>
  client.get<MsgPage>(sent ? '/msg/sent' : '/msg/inbox', {
    params,
    ...feedback,
  });
const rawMsgApi = {
  list: listMessages,
  sentSummary: () =>
    client.get<MsgSentSummary>('/msg/sent/summary', {
      ...quietRequest,
      params: { f: 'total,counts' },
    }),
  get: (id: number, sent: boolean) =>
    sent
      ? client.get<Msg>(`/msg/sent/${id}`, {
          params: { f: msgSentDetailFields },
        })
      : client.get<Msg>(`/msg/inbox/${id}`),
  count: () => client.get<MessageStatus>('/msg/unread-count', quietRequest),
  read: (id: number) =>
    client.request(`/msg/inbox/${id}`, {
      method: 'PATCH',
      data: { read: true },
    }),
  readAll: () => client.post('/msg/inbox/read-all'),
  remove: (id: number, sent: boolean) =>
    client.delete(`/msg/${sent ? 'sent' : 'inbox'}/${id}`),
  send: (data: MsgInput, key: string, feedback?: RequestErrorFeedback) =>
    client.post<Msg>('/msg', data, {
      ...feedback,
      headers: { 'x-idempotent': key },
    }),
  users: (q: string) =>
    client.get<MsgUser[]>('/msg/recipient-option', { params: { q } }),
};

const statusRequest = new MessageStatusRequest<MessageStatus>();
async function withdrawIfPresent(id: number) {
  try {
    await client.delete(`/msg/sent/${id}`, quietRequest);
  } catch (error) {
    const response = (
      error as {
        response?: { status?: number; data?: { error_code?: string } };
      }
    )?.response;
    if (
      response?.status !== 404 ||
      response.data?.error_code !== 'MSG_NOT_FOUND'
    )
      throw error;
  }
}

async function changed<T>(operation: Promise<T>): Promise<T> {
  const result = await operation;
  statusRequest.invalidate();
  return result;
}
export const msgApi = {
  ...rawMsgApi,
  count: (user: number | undefined) => {
    const current = userCache.capture();
    return statusRequest.get(user, async () => {
      if (!current()) throw new VerificationCancelled();
      const status = await rawMsgApi.count();
      if (!current()) throw new VerificationCancelled();
      return status;
    });
  },
  read: (...args: Parameters<typeof rawMsgApi.read>) =>
    changed(rawMsgApi.read(...args)),
  readAll: () => changed(rawMsgApi.readAll()),
  remove: (...args: Parameters<typeof rawMsgApi.remove>) =>
    changed(rawMsgApi.remove(...args)),
  withdrawIfPresent: (id: number) => changed(withdrawIfPresent(id)),
  send: (...args: Parameters<typeof rawMsgApi.send>) =>
    changed(rawMsgApi.send(...args)),
};

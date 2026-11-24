import { authRequestClient } from '#/api/request';

import { quietRequest } from './request-types';

export type MailLocale = 'en-US' | 'zh-CN';
export type MailCategory =
  | 'confirmation'
  | 'notification'
  | 'security'
  | 'verification';
export interface MailTranslation {
  subject: string;
  html: string;
  text: string;
  preview_values: Record<string, string>;
}
export type MailContent = Record<MailLocale, MailTranslation>;
export interface MailTemplate {
  id: number;
  template_id: string;
  name: string;
  category: MailCategory;
  created_at: number;
  updated_at: number;
  revision: number;
  published_version: number;
  has_draft: boolean;
  content: MailContent;
}
export type MailTemplateSummary = Omit<MailTemplate, 'content'>;
export interface MailVersion {
  id: number;
  created_at: number;
  version: number;
  name: string;
  category: MailCategory;
  published_by: number;
  content: MailContent;
}
export interface MailTemplatePage {
  items: MailTemplateSummary[];
  t: number;
  p: number;
  s: number;
}
export const listMailTemplates = (params: {
  p: number;
  s: number;
  q?: string;
  category?: string;
}) => authRequestClient.get<MailTemplatePage>('/mail-template', { params });
export const getMailTemplate = (id: number) =>
  authRequestClient.get<MailTemplate>(`/mail-template/${id}`);
export const createMailTemplate = (
  data: Pick<MailTemplate, 'category' | 'content' | 'name' | 'template_id'>,
  key: string,
) =>
  authRequestClient.post<MailTemplate>('/mail-template', data, {
    ...quietRequest,
    headers: { 'x-idempotent': key },
  });
export const updateMailTemplate = (
  id: number,
  data: Partial<Pick<MailTemplate, 'template_id'>> &
    Pick<MailTemplate, 'category' | 'content' | 'name' | 'revision'>,
) =>
  authRequestClient.request<MailTemplate>(`/mail-template/${id}`, {
    ...quietRequest,
    method: 'PATCH',
    data,
  });
export const publishMailTemplate = (
  id: number,
  revision: number,
  key: string,
) =>
  authRequestClient.post<MailTemplate>(
    `/mail-template/${id}/publish`,
    { revision },
    { ...quietRequest, headers: { 'x-idempotent': key } },
  );
export const deleteMailTemplate = (id: number) =>
  authRequestClient.delete(`/mail-template/${id}`);
export const listMailVersions = (id: number) =>
  authRequestClient.get<Omit<MailVersion, 'content'>[]>(
    `/mail-template/${id}/version`,
  );
export const getMailVersion = (id: number, version: number) =>
  authRequestClient.get<MailVersion>(`/mail-template/${id}/version/${version}`);

export interface MailTestInput {
  locale: MailLocale;
  content: Pick<MailTranslation, 'html' | 'subject' | 'text'>;
  values: Record<string, string>;
}
export const sendMailTemplateTest = (
  id: number,
  data: MailTestInput,
  key: string,
) =>
  authRequestClient.post(`/mail-template/${id}/test-send`, data, {
    ...quietRequest,
    headers: { 'x-idempotent': key },
    timeout: 30_000,
  });

export const discardMailTemplateDraft = (id: number, revision: number) =>
  authRequestClient.request<MailTemplate>(`/mail-template/${id}`, {
    ...quietRequest,
    method: 'PATCH',
    data: { revision, discard_draft: true },
  });

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMailTemplate,
  discardMailTemplateDraft,
  getMailTemplate,
  listMailTemplates,
  publishMailTemplate,
  sendMailTemplateTest,
  updateMailTemplate,
} from './mail-template';
import { needsSensitivePreflight } from './verification-policy';
const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('#/api/request', () => ({ authRequestClient: client }));
describe('email template requests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the auth client and service-local paths', async () => {
    await listMailTemplates({ p: 1, s: 20, q: 'order' });
    await getMailTemplate(7);
    expect(client.get).toHaveBeenCalledWith('/mail-template', {
      params: { p: 1, s: 20, q: 'order' },
    });
    expect(client.get).toHaveBeenCalledWith('/mail-template/7');
  });
  it('preserves optimistic revisions and stable retry keys', async () => {
    const content = {
      'zh-CN': { subject: '', html: '', text: '', preview_values: {} },
      'en-US': { subject: '', html: '', text: '', preview_values: {} },
    };
    await createMailTemplate(
      {
        template_id: 'order.paid',
        name: 'Paid',
        category: 'notification',
        content,
      },
      'create-key',
    );
    await updateMailTemplate(7, {
      revision: 4,
      template_id: 'order.payment_success',
      name: 'Paid',
      category: 'notification',
      content,
    });
    await publishMailTemplate(7, 5, 'publish-key');
    expect(client.post).toHaveBeenCalledWith(
      '/mail-template',
      expect.any(Object),
      { suppressErrorMessage: true, headers: { 'x-idempotent': 'create-key' } },
    );
    expect(client.request).toHaveBeenCalledWith('/mail-template/7', {
      suppressErrorMessage: true,
      method: 'PATCH',
      data: expect.objectContaining({
        revision: 4,
        template_id: 'order.payment_success',
      }),
    });
    expect(client.post).toHaveBeenCalledWith(
      '/mail-template/7/publish',
      { revision: 5 },
      {
        suppressErrorMessage: true,
        headers: { 'x-idempotent': 'publish-key' },
      },
    );
  });
  it('sends explicit editor content and values with a stable retry key', async () => {
    const input = {
      locale: 'en-US' as const,
      content: { subject: 'Draft', html: '<b>{{code}}</b>', text: '{{code}}' },
      values: { code: 'edited' },
    };
    await sendMailTemplateTest(7, input, 'test-key');
    expect(client.post).toHaveBeenCalledWith(
      '/mail-template/7/test-send',
      input,
      {
        suppressErrorMessage: true,
        headers: { 'x-idempotent': 'test-key' },
        timeout: 30_000,
      },
    );
    expect(
      needsSensitivePreflight('POST', '/mail-template/7/test-send', true),
    ).toBe(true);
  });
  it('discards a draft with its current revision through the protected update endpoint', async () => {
    await discardMailTemplateDraft(7, 9);
    expect(client.request).toHaveBeenCalledWith('/mail-template/7', {
      suppressErrorMessage: true,
      method: 'PATCH',
      data: { revision: 9, discard_draft: true },
    });
  });
  it('exempts drafts while protecting publication, test delivery and deletion', () => {
    expect(
      needsSensitivePreflight('POST', '/mail-template/7/publish', true),
    ).toBe(true);
    expect(needsSensitivePreflight('PATCH', '/mail-template/7', true)).toBe(
      false,
    );
    expect(needsSensitivePreflight('POST', '/mail-template', true)).toBe(false);
    expect(needsSensitivePreflight('DELETE', '/mail-template/7', true)).toBe(
      true,
    );
    expect(
      needsSensitivePreflight('PATCH', '/mail-template/7/publish', true),
    ).toBe(true);
    expect(
      needsSensitivePreflight('POST', '/mail-template/7/other', true),
    ).toBe(true);
    expect(needsSensitivePreflight('GET', '/mail-template/7', true)).toBe(
      false,
    );
  });
});

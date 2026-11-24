import type { MailTemplate } from '#/api/mail-template';

import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import { message, Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VerificationCancelled } from '#/security/verification-prompt';

import MailEditor from './editor.vue';
import MailTestSend from './test-send.vue';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  format: vi.fn(),
  discard: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  versions: vi.fn(),
  version: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('#/api/mail-template', () => ({
  getMailTemplate: api.get,
  discardMailTemplateDraft: api.discard,
  updateMailTemplate: api.update,
  publishMailTemplate: api.publish,
  listMailVersions: api.versions,
  getMailVersion: api.version,
}));
vi.mock('./format-html', () => ({ formatMailHTML: api.format }));
vi.mock('./test-send.vue', () => ({ default: { render: () => null } }));
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
}));
vi.mock('@vben/utils', () => ({ formatDateTime: String }));
vi.mock('#/locales', () => ({ $t: (key: string) => key.split('.').at(-1) }));
vi.mock('#/composables/use-operation-confirmation', () => ({
  useOperationConfirmation: () => ({ confirmSensitiveOperation: api.confirm }),
}));
vi.mock('ant-design-vue', async (original) => {
  const actual = await original<typeof import('ant-design-vue')>();
  const { defineComponent, h } = await import('vue');
  const modal = defineComponent({
    props: { open: Boolean, title: { type: String, default: '' } },
    emits: ['ok', 'update:open'],
    setup:
      (props, { slots, emit }) =>
      () =>
        props.open
          ? h('section', { role: 'dialog', 'aria-label': props.title }, [
              slots.default?.(),
              h(
                'button',
                { 'data-confirm': true, onClick: () => emit('ok') },
                'confirm',
              ),
            ])
          : null,
  });
  Object.assign(modal, { confirm: vi.fn() });
  return {
    ...actual,
    Modal: modal,
    message: { success: vi.fn(), error: vi.fn() },
  };
});

function record(): MailTemplate {
  return {
    id: 3,
    template_id: 'test.notice',
    name: 'Test',
    category: 'notification',
    created_at: 1,
    updated_at: 2,
    revision: 1,
    published_version: 0,
    has_draft: true,
    content: {
      'zh-CN': {
        subject: '中文主题',
        html: '<p>A</p><b>{{code}}</b>',
        text: '中文纯文本',
        preview_values: { code: '123456' },
      },
      'en-US': {
        subject: 'English subject',
        html: '<p>AB</p>',
        text: 'Plain English',
        preview_values: {},
      },
    },
  };
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected UI control');
  return value;
}
let wrapper: ReturnType<typeof mount>;
async function render(canEdit = true) {
  wrapper = mount(MailEditor, {
    props: { id: 3, canEdit, canPublish: canEdit },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockReset().mockResolvedValue(record());
  api.format.mockReset().mockResolvedValue('<p>\n  A\n</p>');
  api.update.mockReset();
  api.update.mockImplementation(async (_id, payload) => ({
    ...record(),
    ...structuredClone(payload),
    revision: payload.revision + 1,
  }));
  api.versions.mockResolvedValue([]);
  api.version.mockReset().mockImplementation(async (_id, version) => ({
    ...record(),
    version,
    published_by: 1,
  }));
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
    () => {},
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 10 }),
  } as never);
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('email template editor interactions', () => {
  it.each([false, true])(
    'keeps version rows and permitted actions in place while loading (canEdit=%s)',
    async (canEdit) => {
      const template = { ...record(), published_version: 2 };
      const items = [2, 1].map((version) => ({
        ...template,
        id: version,
        version,
        published_by: 1,
      }));
      const first = Promise.withResolvers<typeof items>();
      const refresh = Promise.withResolvers<typeof items>();
      api.get.mockResolvedValue(template);
      api.versions
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(refresh.promise);
      await render(canEdit);
      const tab = required(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'versions'),
      );
      await tab.trigger('click');
      const firstRow = () => wrapper.get('.version-row');
      expect(wrapper.findAll('.version-row')).toHaveLength(2);
      const pendingRow = firstRow().element;
      const pendingButtons = firstRow().findAll('button');
      expect(pendingButtons.map((button) => button.text())).toEqual(
        canEdit ? ['view', 'restore'] : ['view'],
      );
      expect(pendingButtons.every((button) => button.element.disabled)).toBe(
        true,
      );
      expect(wrapper.text()).not.toContain('noVersions');

      first.resolve(items);
      await flushPromises();
      expect(firstRow().element).toBe(pendingRow);
      await tab.trigger('click');
      expect(firstRow().element).toBe(pendingRow);
      expect(firstRow().get('button').element.disabled).toBe(true);
      refresh.resolve(items);
      await flushPromises();
      expect(firstRow().element).toBe(pendingRow);
      expect(firstRow().get('button').element.disabled).toBe(false);
    },
  );

  it('formats only the current HTML translation and autosaves the draft', async () => {
    await render();
    vi.useFakeTimers();
    const original = record();
    const formatted = '<p>\n  A\n</p><b>{{code}}</b>';
    api.format.mockResolvedValue(formatted);
    await required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'formatHTML'),
    ).trigger('click');
    await flushPromises();
    expect(api.format).toHaveBeenCalledWith(original.content['zh-CN'].html);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      formatted,
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(api.update).toHaveBeenCalledTimes(1);
    const content = required(api.update.mock.calls[0])[1].content;
    expect(content['zh-CN'].html).toBe(formatted);
    expect(content['zh-CN'].text).toBe(original.content['zh-CN'].text);
    expect(content['en-US']).toEqual(original.content['en-US']);
    expect(api.publish).not.toHaveBeenCalled();
  });

  it('retains the source and reports formatting errors inline', async () => {
    await render();
    api.format.mockRejectedValue(new Error('Invalid HTML'));
    await required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'formatHTML'),
    ).trigger('click');
    await flushPromises();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      record().content['zh-CN'].html,
    );
    expect(wrapper.get('.field-error').text()).toBe('formatFailed');
    expect(api.update).not.toHaveBeenCalled();
  });

  it('does not overwrite edits made while the formatter is loading', async () => {
    await render();
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    api.format.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'formatHTML'),
    ).trigger('click');
    await wrapper.get('textarea').setValue('<p>Newer edit</p>');
    finish('<p>Old formatted content</p>');
    await flushPromises();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>Newer edit</p>',
    );
  });

  it('ignores an in-flight result after switching languages', async () => {
    await render();
    let finish!: (value: string) => void;
    api.format.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'formatHTML'),
    ).trigger('click');
    await required(
      wrapper.findAll('label').find((label) => label.text() === 'English'),
    )
      .get('input')
      .setValue(true);
    finish('<p>Old formatted content</p>');
    await flushPromises();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      record().content['en-US'].html,
    );
    expect(api.update).not.toHaveBeenCalled();
  });

  it('hides formatting in read-only mode', async () => {
    await render(false);
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text() === 'formatHTML'),
    ).toBe(false);
  });

  it('publishes a saved draft without edit permission or a draft update', async () => {
    await render(false);
    await wrapper.setProps({ canPublish: true });
    api.publish.mockResolvedValueOnce({
      ...record(),
      published_version: 1,
      has_draft: false,
    });

    await required(
      wrapper.findAll('button').find((button) => button.text() === 'publish'),
    ).trigger('click');
    await required(api.confirm.mock.calls[0])[0].onOk();

    expect(api.update).not.toHaveBeenCalled();
    expect(api.publish).toHaveBeenCalledExactlyOnceWith(
      3,
      1,
      expect.any(String),
    );
  });

  it('keeps publication idle while test delivery owns the busy state', async () => {
    await render();
    await required(
      wrapper.findAll('button').find((button) => button.text() === 'testSend'),
    ).trigger('click');
    const sending = wrapper.findComponent(MailTestSend);
    expect(sending.exists()).toBe(true);
    sending.vm.$emit('sending', true);
    await nextTick();
    const publishButton = () =>
      required(
        wrapper.findAll('button').find((button) => button.text() === 'publish'),
      );
    expect(publishButton().attributes('disabled')).toBeDefined();
    expect(publishButton().classes()).not.toContain('ant-btn-loading');
    expect(wrapper.findAll('button.ant-btn-loading')).toHaveLength(0);
    expect(api.publish).not.toHaveBeenCalled();
    sending.vm.$emit('sending', false);
    await nextTick();
    expect(publishButton().attributes('disabled')).toBeUndefined();
  });

  it('shows publication loading only for its own request and clears it on cancellation', async () => {
    await render();
    let cancel!: (reason: Error) => void;
    api.publish.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          cancel = reject;
        }),
    );
    const publishButton = () =>
      required(
        wrapper.findAll('button').find((button) => button.text() === 'publish'),
      );
    await publishButton().trigger('click');
    const pending = required(api.confirm.mock.calls[0])[0].onOk();
    await flushPromises();
    expect(publishButton().classes()).toContain('ant-btn-loading');
    expect(wrapper.findAll('button.ant-btn-loading')).toHaveLength(1);
    cancel(new VerificationCancelled());
    await pending;
    await flushPromises();
    expect(publishButton().classes()).not.toContain('ant-btn-loading');
    expect(publishButton().attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).not.toContain('saveFailed');
  });

  it('silently cancels publication verification and allows publishing again', async () => {
    await render();
    const source = (wrapper.get('textarea').element as HTMLTextAreaElement)
      .value;
    api.publish.mockRejectedValueOnce(new VerificationCancelled());
    const publishButton = () =>
      required(
        wrapper.findAll('button').find((button) => button.text() === 'publish'),
      );
    await publishButton().trigger('click');
    expect(api.publish).not.toHaveBeenCalled();
    await required(api.confirm.mock.calls[0])[0].onOk();
    await flushPromises();
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('saveFailed');
    expect(
      wrapper.findAll('.ant-alert').some((alert) => alert.isVisible()),
    ).toBe(false);
    expect(message.success).not.toHaveBeenCalled();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      source,
    );
    expect(publishButton().attributes('disabled')).toBeUndefined();
    api.publish.mockResolvedValueOnce({
      ...record(),
      published_version: 1,
      has_draft: false,
    });
    await publishButton().trigger('click');
    await required(api.confirm.mock.calls[1])[0].onOk();
    await flushPromises();
    expect(api.publish).toHaveBeenCalledTimes(2);
    expect(message.success).toHaveBeenCalledWith('publishedSuccess');
  });

  it('still reports a genuine publication conflict', async () => {
    await render();
    api.publish.mockRejectedValueOnce({
      response: { status: 409, data: { error_code: 'MAIL_TEMPLATE_CONFLICT' } },
    });
    await required(
      wrapper.findAll('button').find((button) => button.text() === 'publish'),
    ).trigger('click');
    await required(api.confirm.mock.calls[0])[0].onOk();
    await flushPromises();
    expect(wrapper.text()).toContain('conflict');
  });

  it('reports a superseding live version without replacing the submitted content or writing again', async () => {
    await render();
    const other = record();
    other.content['zh-CN'].html = '<p>Changed by another editor</p>';
    api.get.mockResolvedValue({ ...other, revision: 4, published_version: 2 });
    api.version.mockResolvedValue({ ...other, version: 2, published_by: 7 });
    api.publish.mockRejectedValueOnce(new Error('response lost'));

    await required(
      wrapper.findAll('button').find((button) => button.text() === 'publish'),
    ).trigger('click');
    await required(api.confirm.mock.calls[0])[0].onOk();
    await flushPromises();

    expect(api.version).toHaveBeenCalledWith(3, 2);
    expect(wrapper.text()).toContain('publicationDifferent');
    expect(wrapper.get('textarea').element.value).toBe(
      record().content['zh-CN'].html,
    );
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(api.update).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });

  it('disables publication and discard when a saved draft matches the publication', async () => {
    api.get.mockResolvedValue({
      ...record(),
      published_version: 1,
      has_draft: true,
    });
    await render();
    for (const label of ['publish', 'discardDraft']) {
      const button = required(
        wrapper.findAll('button').find((button) => button.text() === label),
      );
      expect(button.attributes('disabled')).toBeDefined();
      await button.trigger('click');
    }
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
    expect(api.discard).not.toHaveBeenCalled();
  });

  it.each(['before', 'after', 'during'])(
    'disables actions after reverting edits %s autosave',
    async (timing) => {
      const baseline = { ...record(), published_version: 1, has_draft: true };
      api.get.mockResolvedValue(structuredClone(baseline));
      api.update.mockImplementation(async (_id, payload) => ({
        ...baseline,
        ...structuredClone(payload),
        revision: payload.revision + 1,
      }));
      await render();
      vi.useFakeTimers();
      let finish!: (value: MailTemplate) => void;
      if (timing === 'during')
        api.update.mockImplementationOnce(
          () =>
            new Promise<MailTemplate>((resolve) => {
              finish = resolve;
            }),
        );
      const button = (label: string) =>
        required(
          wrapper.findAll('button').find((button) => button.text() === label),
        );
      await wrapper
        .get('textarea')
        .setValue(`${baseline.content['zh-CN'].html}<p>Changed</p>`);
      expect(button('publish').attributes('disabled')).toBeUndefined();
      expect(button('discardDraft').attributes('disabled')).toBeUndefined();
      if (timing !== 'before') await vi.advanceTimersByTimeAsync(500);
      await wrapper.get('textarea').setValue(baseline.content['zh-CN'].html);
      expect(button('publish').attributes('disabled')).toBeDefined();
      expect(button('discardDraft').attributes('disabled')).toBeDefined();
      if (timing === 'during') {
        finish({
          ...baseline,
          ...required(api.update.mock.calls[0])[1],
          revision: 2,
        });
        await flushPromises();
      }
      await vi.advanceTimersByTimeAsync(1000);
      expect(button('publish').attributes('disabled')).toBeDefined();
      expect(button('discardDraft').attributes('disabled')).toBeDefined();
      expect(api.update).toHaveBeenCalledTimes(timing === 'before' ? 0 : 2);
      expect(api.publish).not.toHaveBeenCalled();
      expect(api.discard).not.toHaveBeenCalled();
    },
  );

  it('retries a failed publication read without losing local edits', async () => {
    api.get.mockResolvedValue({ ...record(), published_version: 1 });
    api.version.mockRejectedValueOnce(new Error('offline'));
    await render();
    vi.useFakeTimers();
    await wrapper.get('textarea').setValue('<p>Local edit</p>');
    const publish = () =>
      required(
        wrapper.findAll('button').find((button) => button.text() === 'publish'),
      );
    expect(publish().attributes('disabled')).toBeDefined();
    await wrapper.get('.load-warning button').trigger('click');
    await flushPromises();
    expect(publish().attributes('disabled')).toBeUndefined();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>Local edit</p>',
    );
  });

  it.each(['success', 'failure'])(
    'ignores a late %s from a previously selected version',
    async (outcome) => {
      const older = { ...record(), id: 11, version: 1, published_by: 1 };
      const latest = { ...record(), id: 12, version: 2, published_by: 1 };
      api.versions.mockResolvedValue([latest, older]);
      let release!: () => void;
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      api.version
        .mockImplementationOnce(async () => {
          await delayed;
          if (outcome === 'failure') throw new Error('offline');
          return older;
        })
        .mockResolvedValueOnce(latest);

      await render();
      await required(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'versions'),
      ).trigger('click');
      await flushPromises();
      const [viewLatest, viewOlder] = wrapper
        .findAll('button')
        .filter((button) => button.text() === 'view');
      await required(viewOlder).trigger('click');
      await required(viewLatest).trigger('click');
      await flushPromises();
      expect(api.version.mock.calls).toEqual([
        [3, 1],
        [3, 2],
      ]);
      expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe(
        'v2',
      );

      release();
      await flushPromises();
      expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe(
        'v2',
      );
      expect(wrapper.find('.load-warning').exists()).toBe(false);
    },
  );

  it('discards both language drafts after an in-flight autosave without publishing', async () => {
    const published = { ...record(), published_version: 1, has_draft: false };
    api.get.mockResolvedValue(structuredClone(published));
    await render();
    vi.useFakeTimers();
    let finish!: (value: MailTemplate) => void;
    api.update.mockImplementationOnce(
      () =>
        new Promise<MailTemplate>((resolve) => {
          finish = resolve;
        }),
    );
    await wrapper.get('textarea').setValue('<p>Edited draft</p>');
    await vi.advanceTimersByTimeAsync(500);
    await required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'discardDraft'),
    ).trigger('click');
    expect(api.discard).not.toHaveBeenCalled();
    api.discard.mockResolvedValue({ ...published, revision: 3 });
    const discard = required(api.confirm.mock.calls[0])[0].onOk();
    finish({
      ...published,
      ...required(api.update.mock.calls[0])[1],
      revision: 2,
      has_draft: true,
    });
    await discard;
    await flushPromises();
    expect(api.discard).toHaveBeenCalledWith(3, 2);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      published.content['zh-CN'].html,
    );
    expect(
      required(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'discardDraft'),
      ).attributes(),
    ).toHaveProperty('disabled');
    expect(
      required(
        wrapper.findAll('button').find((button) => button.text() === 'publish'),
      ).attributes(),
    ).toHaveProperty('disabled');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.publish).not.toHaveBeenCalled();
  });
  it('preserves the local draft on a discard conflict and prevents autosave retries', async () => {
    api.get.mockResolvedValue({ ...record(), published_version: 1 });
    await render();
    vi.useFakeTimers();
    await wrapper.get('textarea').setValue('<p>Keep my edits</p>');
    await required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'discardDraft'),
    ).trigger('click');
    api.discard.mockRejectedValue({
      response: { data: { error_code: 'MAIL_TEMPLATE_CONFLICT' } },
    });
    await required(api.confirm.mock.calls[0])[0].onOk();
    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.text()).toContain('conflict');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>Keep my edits</p>',
    );
    expect(api.update).not.toHaveBeenCalled();
  });
  it('does not discard an unpublished template', async () => {
    await render();
    expect(
      required(
        wrapper
          .findAll('button')
          .find((button) => button.text() === 'discardDraft'),
      ).attributes(),
    ).toHaveProperty('disabled');
  });
  it('hides the duplicate load alert for 502 while preserving ordinary failures', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 502 } });
    await render();
    expect(wrapper.get('.load-warning button').isVisible()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    wrapper.unmount();
    await render();
    expect(wrapper.get('.load-warning button').isVisible()).toBe(true);
    await wrapper.get('.load-warning button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.load-warning').exists()).toBe(false);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('debounces edits for 500ms and automatically saves the latest draft', async () => {
    await render();
    vi.useFakeTimers();
    const source = wrapper.get('textarea');
    await source.setValue('<p>First</p>');
    await vi.advanceTimersByTimeAsync(250);
    await source.setValue('<p>Latest</p>');
    await vi.advanceTimersByTimeAsync(499);
    expect(api.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        revision: 1,
        content: expect.objectContaining({
          'zh-CN': expect.objectContaining({ html: '<p>Latest</p>' }),
        }),
      }),
    );
    expect(wrapper.text()).toContain('savedAutomatically');
    expect(wrapper.text()).not.toContain('dirty');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.publish).not.toHaveBeenCalled();
  });
  it('keeps edits made during a pending save and serializes the next revision', async () => {
    await render();
    vi.useFakeTimers();
    let finish!: (value: MailTemplate) => void;
    api.update.mockImplementationOnce(
      () =>
        new Promise<MailTemplate>((resolve) => {
          finish = resolve;
        }),
    );
    const source = wrapper.get('textarea');
    await source.setValue('<p>First</p>');
    await vi.advanceTimersByTimeAsync(500);
    expect(source.attributes('readonly')).toBeUndefined();
    expect(wrapper.text()).toContain('savingDraft');
    await source.setValue('<p>Second</p>');
    await vi.advanceTimersByTimeAsync(250);
    expect(api.update).toHaveBeenCalledTimes(1);
    finish({
      ...record(),
      ...structuredClone(required(api.update.mock.calls[0])[1]),
      revision: 2,
    });
    await flushPromises();
    expect((source.element as HTMLTextAreaElement).value).toBe('<p>Second</p>');
    await vi.advanceTimersByTimeAsync(249);
    expect(api.update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(required(api.update.mock.calls[1])[1]).toMatchObject({
      revision: 2,
      content: { 'zh-CN': { html: '<p>Second</p>' } },
    });
    expect(wrapper.text()).toContain('savedAutomatically');
  });
  it.each(['automatic', 'manual'])(
    'keeps failed %s draft saves quiet and retains edits for retry',
    async (mode) => {
      await render();
      vi.useFakeTimers();
      api.update.mockRejectedValueOnce(new Error('offline'));
      await wrapper.get('textarea').setValue('<p>Retained</p>');
      if (mode === 'automatic') await vi.advanceTimersByTimeAsync(500);
      else {
        await required(
          wrapper.findAll('button').find((button) => button.text() === 'save'),
        ).trigger('click');
        await flushPromises();
      }
      expect(api.update).toHaveBeenCalledTimes(1);
      expect(wrapper.text()).not.toContain('saveFailed');
      expect(wrapper.text()).not.toContain('savedAutomatically');
      expect(wrapper.text()).toContain('dirty');
      expect(
        (wrapper.get('textarea').element as HTMLTextAreaElement).value,
      ).toBe('<p>Retained</p>');
      await vi.advanceTimersByTimeAsync(2000);
      expect(api.update).toHaveBeenCalledTimes(1);
      await required(
        wrapper.findAll('button').find((button) => button.text() === 'save'),
      ).trigger('click');
      await flushPromises();
      expect(api.update).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).not.toContain('dirty');
    },
  );
  it('retains edits and pauses automatic retries after a failure until manual save', async () => {
    await render();
    vi.useFakeTimers();
    api.update.mockRejectedValueOnce({
      response: { data: { error_code: 'MAIL_TEMPLATE_CONFLICT' } },
    });
    await wrapper.get('textarea').setValue('<p>Retained</p>');
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.text()).toContain('conflict');
    await wrapper.get('textarea').setValue('<p>Still retained</p>');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>Still retained</p>',
    );
    await required(
      wrapper.findAll('button').find((button) => button.text() === 'save'),
    ).trigger('click');
    await flushPromises();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain('dirty');
  });
  it('does not save incomplete placeholders, and resumes after they are completed', async () => {
    await render();
    vi.useFakeTimers();
    await wrapper.get('textarea').setValue('<p>{{co</p>');
    await vi.advanceTimersByTimeAsync(500);
    expect(api.update).not.toHaveBeenCalled();
    await wrapper.get('textarea').setValue('<p>{{code}}</p>');
    await vi.advanceTimersByTimeAsync(500);
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it('flushes a pending edit when navigating away before the debounce finishes', async () => {
    await render();
    vi.useFakeTimers();
    await wrapper.get('textarea').setValue('<p>Leaving</p>');
    expect(
      await (
        wrapper.vm as unknown as { confirmLeave: () => Promise<boolean> }
      ).confirmLeave(),
    ).toBe(true);
    expect(api.update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it('discards once when tab closure and route navigation check the same draft', async () => {
    await render();
    const name = wrapper.get<HTMLInputElement>('input[aria-label="name"]');
    const source = wrapper.get<HTMLTextAreaElement>('textarea');
    const editor = wrapper.vm as unknown as {
      confirmLeave: () => Promise<boolean>;
    };
    const confirm = vi.mocked(Modal.confirm);
    await name.setValue('');
    await source.setValue('<p>Unsaved edit</p>');

    const cancelled = editor.confirmLeave();
    await flushPromises();
    required(confirm.mock.calls[0])[0].onCancel?.();
    await expect(cancelled).resolves.toBe(false);
    expect(name.element.value).toBe('');
    expect(source.element.value).toBe('<p>Unsaved edit</p>');

    const closing = editor.confirmLeave();
    await flushPromises();
    required(confirm.mock.calls[1])[0].onOk?.();
    await expect(closing).resolves.toBe(true);
    const leaving = editor.confirmLeave();
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(2);
    await expect(leaving).resolves.toBe(true);
    expect(name.element.value).toBe(record().name);
    expect(source.element.value).toBe(record().content['zh-CN'].html);
    expect(api.update).not.toHaveBeenCalled();
  });
  it('cancels scheduled saves on unmount', async () => {
    await render();
    vi.useFakeTimers();
    await wrapper.get('textarea').setValue('<p>Unmount</p>');
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.update).not.toHaveBeenCalled();
  });
  it('uses the latest saved revision when confirming publication', async () => {
    await render();
    vi.useFakeTimers();
    await wrapper.get('textarea').setValue('<p>Before confirmation</p>');
    await required(
      wrapper.findAll('button').find((button) => button.text() === 'publish'),
    ).trigger('click');
    await vi.advanceTimersByTimeAsync(500);
    await wrapper.get('textarea').setValue('<p>After confirmation opened</p>');
    api.publish.mockResolvedValue({
      ...record(),
      revision: 4,
      published_version: 1,
    });
    await required(api.confirm.mock.calls[0])[0].onOk();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.publish).toHaveBeenCalledWith(3, 3, expect.any(String));
  });
  it('opens comparison with unsaved edits without saving or publishing them', async () => {
    await render();
    await wrapper.get('textarea').setValue('<p>Unsaved comparison</p>');
    await required(
      wrapper.findAll('button').find((button) => button.text() === 'compare'),
    ).trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').text()).toContain(
      '<p>Unsaved comparison</p>',
    );
    expect(api.update).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>Unsaved comparison</p>',
    );
  });
  it('inserts at the original caret, renders the example, and selects the placeholder', async () => {
    await render();
    const source = wrapper.get('textarea');
    await source.setValue('<p>AB</p>');
    (source.element as HTMLTextAreaElement).focus();
    (source.element as HTMLTextAreaElement).setSelectionRange(4, 4);
    await nextTick();
    const insert = required(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'insertParameter'),
    );
    await insert.trigger('click');
    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('input[aria-label="parameterName"]').setValue('order_no');
    await dialog.get('input[aria-label="previewValueZh"]').setValue('订单-001');
    await dialog.get('input[aria-label="previewValueEn"]').setValue('ORD-001');
    await dialog.get('[data-confirm]').trigger('click');
    await flushPromises();
    expect((source.element as HTMLTextAreaElement).value).toBe(
      '<p>A{{order_no}}B</p>',
    );
    const element = source.element as HTMLTextAreaElement;
    expect(
      element.value.slice(element.selectionStart, element.selectionEnd),
    ).toBe('{{order_no}}');
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain('A订单-001B');
    expect(wrapper.get('.parameter-tag').text()).toContain('订单-001');
    await required(
      wrapper.findAll('label').find((label) => label.text() === 'English'),
    )
      .get('input')
      .setValue(true);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>A{{order_no}}B</p>',
    );
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain('AORD-001B');
  });
  it('opens preview-value editing for a source-discovered parameter without rewriting HTML', async () => {
    await render();
    vi.useFakeTimers();
    const source = wrapper.get('textarea');
    await source.setValue('<p>{{code2}}</p>');
    await wrapper.get('.parameter-tag').trigger('click');
    await vi.advanceTimersByTimeAsync(250);
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-label')).toBe('setPreview');
    await dialog.get('[data-confirm]').trigger('click');
    expect(dialog.text()).toContain('previewValueRequired');
    await dialog.get('input[aria-label="previewValueZh"]').setValue('654321');
    await dialog.get('input[aria-label="previewValueEn"]').setValue('123456');
    await dialog.get('[data-confirm]').trigger('click');
    await nextTick();
    expect((source.element as HTMLTextAreaElement).value).toBe(
      '<p>{{code2}}</p>',
    );
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain(
      '<p>654321</p>',
    );
  });
  it('keeps HTML preview while editing plain text and separates language contents', async () => {
    await render();
    const before = wrapper.get('iframe').attributes('srcdoc');
    await required(
      wrapper.findAll('label').find((label) => label.text() === 'text'),
    )
      .get('input')
      .setValue(true);
    await wrapper.get('textarea').setValue('Plain text changed');
    expect(wrapper.get('iframe').attributes('srcdoc')).toBe(before);
    await required(
      wrapper.findAll('label').find((label) => label.text() === 'English'),
    )
      .get('input')
      .setValue(true);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'Plain English',
    );
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain('<p>AB</p>');
  });
  it('preserves edits on a save conflict', async () => {
    await render();
    api.update.mockRejectedValue({
      response: { data: { error_code: 'MAIL_TEMPLATE_CONFLICT' } },
    });
    await wrapper.get('textarea').setValue('<p>Edited</p>');
    await required(
      wrapper.findAll('button').find((button) => button.text() === 'save'),
    ).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('conflict');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      '<p>Edited</p>',
    );
    expect(api.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ revision: 1 }),
    );
  });
  it('does not expose insertion or write actions to a read-only viewer', async () => {
    await render(false);
    expect(wrapper.get('textarea').attributes()).toHaveProperty('readonly');
    expect(
      wrapper.get('input[aria-label="templateID"]').attributes(),
    ).toHaveProperty('disabled');
    expect(
      wrapper
        .findAll('button')
        .some((button) =>
          ['discardDraft', 'insertParameter', 'publish', 'save'].includes(
            button.text(),
          ),
        ),
    ).toBe(false);
  });
  it('saves an ID-only edit with the same numeric identity and publication history', async () => {
    await render();
    api.update.mockResolvedValue({
      ...record(),
      template_id: 'order.payment_success',
      revision: 2,
    });
    const field = wrapper.get('input[aria-label="templateID"]');
    await field.setValue('order.payment_success');
    const saveButton = required(
      wrapper.findAll('button').find((button) => button.text() === 'save'),
    );
    expect(saveButton.attributes('disabled')).toBeUndefined();
    await saveButton.trigger('click');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        template_id: 'order.payment_success',
        revision: 1,
      }),
    );
    expect((field.element as HTMLInputElement).value).toBe(
      'order.payment_success',
    );
    expect(saveButton.attributes()).toHaveProperty('disabled');
  });
  it('validates renamed IDs and displays duplicate errors beside the ID field', async () => {
    await render();
    const field = wrapper.get('input[aria-label="templateID"]');
    const saveButton = required(
      wrapper.findAll('button').find((button) => button.text() === 'save'),
    );
    await field.setValue('Invalid ID');
    await saveButton.trigger('click');
    expect(api.update).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('idInvalid');
    await field.setValue('other.template');
    api.update.mockRejectedValue({
      response: { data: { error_code: 'MAIL_TEMPLATE_DUPLICATE' } },
    });
    await saveButton.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('duplicate');
    expect((field.element as HTMLInputElement).value).toBe('other.template');
  });
});

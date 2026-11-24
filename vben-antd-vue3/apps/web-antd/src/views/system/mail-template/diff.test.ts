import type { MailTemplate, MailVersion } from '#/api/mail-template';

import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyContent } from './content';
import TemplateDiff from './diff.vue';
const api = vi.hoisted(() => ({
  get: vi.fn(),
  version: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('#/api/mail-template', () => ({
  getMailTemplate: api.get,
  getMailVersion: api.version,
  updateMailTemplate: api.update,
  publishMailTemplate: api.publish,
}));
vi.mock('ant-design-vue', async (original) => {
  const actual = await original<typeof import('ant-design-vue')>();
  const { defineComponent, h } = await import('vue');
  return {
    ...actual,
    Modal: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('section', { role: 'dialog' }, slots.default?.()),
    }),
  };
});
vi.mock('#/locales', () => ({
  $t: (key: string, values: Record<string, unknown>) =>
    `${key.split('.').at(-1)}${values?.version ? ` ${values.version}` : ''}${values?.total === undefined ? '' : ` ${values.current}/${values.total}`}`,
}));
const draft = (): MailTemplate => ({
  id: 3,
  template_id: 'test.mail',
  name: 'Mail',
  category: 'notification',
  revision: 2,
  created_at: 1,
  updated_at: 2,
  published_version: 1,
  has_draft: true,
  content: emptyContent(),
});
const version = (value: MailTemplate): MailVersion => ({
  id: 5,
  version: 5,
  name: value.name,
  category: value.category,
  content: structuredClone(value.content),
  created_at: 1,
  published_by: 1,
});
let wrapper: ReturnType<typeof mount>;
function render(value = draft(), unsaved = true) {
  wrapper = mount(TemplateDiff, {
    props: { draft: value, unsaved },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  wrapper?.unmount();
});

describe('draft and published content comparison', () => {
  it('keeps the toolbar, column headers and expanded lines during delayed reads', async () => {
    const value = draft();
    const baseline = version(value);
    const prefix = 'A'.repeat(600);
    baseline.content['zh-CN'].html = `${prefix}1`;
    value.content['zh-CN'].html = `${prefix}2`;
    const initial = Promise.withResolvers<MailVersion>();
    const refresh = Promise.withResolvers<MailVersion>();
    api.get.mockResolvedValue({
      ...value,
      published_version: baseline.version,
    });
    api.version
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);
    render(value);
    const toolbar = wrapper.get('.comparison-toolbar').element;
    const headers = wrapper.get('.comparison-head').element;
    expect(
      wrapper.get('.comparison-row').findAll('.comparison-cell'),
    ).toHaveLength(2);
    expect(wrapper.get('.comparison-body').attributes('aria-busy')).toBe(
      'true',
    );
    expect(wrapper.text()).not.toContain('noContentDifferences');

    initial.resolve(baseline);
    await flushPromises();
    await wrapper.get('.folded-content').trigger('click');
    const row = wrapper.get('.comparison-row').element;
    await wrapper.get('.comparison-actions button.ant-btn').trigger('click');
    expect(wrapper.get('.comparison-body').attributes('aria-busy')).toBe(
      'true',
    );
    expect(wrapper.get('.comparison-row').element).toBe(row);
    refresh.resolve(structuredClone(baseline));
    await flushPromises();

    expect(wrapper.get('.comparison-body').attributes('aria-busy')).toBe(
      'false',
    );
    expect(wrapper.get('.comparison-toolbar').element).toBe(toolbar);
    expect(wrapper.get('.comparison-head').element).toBe(headers);
    expect(wrapper.find('.folded-content').exists()).toBe(false);
  });

  it.each(['added', 'removed'])(
    'expands both sides when the %s side is clicked',
    async (side) => {
      const value = draft();
      const image = `<img src="data:image/png;base64,${'A'.repeat(3000)}">`;
      value.content['zh-CN'].html = `<table cellspacing="0">${image}</table>`;
      const published = version(value);
      value.content['zh-CN'].html = `<table cellspacing="02">${image}</table>`;
      api.get.mockResolvedValue({ ...value, published_version: 5 });
      api.version.mockResolvedValue(published);
      render(value);
      await flushPromises();
      expect(wrapper.get('#mail-diff-compact').attributes('aria-checked')).toBe(
        'true',
      );
      expect(
        wrapper.get('#mail-diff-unchanged').attributes('aria-checked'),
      ).toBe('true');
      expect(wrapper.findAll('ins').map((node) => node.text())).toEqual(['2']);
      expect(wrapper.findAll('del')).toHaveLength(0);
      expect(wrapper.find('code img').exists()).toBe(false);
      expect(wrapper.find('.added code').text()).not.toContain(
        'A'.repeat(3000),
      );
      await wrapper.get(`.${side} .folded-content`).trigger('click');
      expect(wrapper.find('.added code').text()).toBe(
        value.content['zh-CN'].html,
      );
      expect(wrapper.find('.removed code').text()).toBe(
        published.content['zh-CN'].html,
      );
      await wrapper.get('#mail-diff-unchanged').trigger('click');
      await wrapper.get('#mail-diff-compact').trigger('click');
      expect(wrapper.findAll('.folded-content')).toHaveLength(0);
      expect(wrapper.find('.removed code').text()).toBe(
        published.content['zh-CN'].html,
      );
    },
  );
  it('navigates individual changes across fields, wraps, and keeps the current target after display toggles', async () => {
    const value = draft();
    value.content['zh-CN'].html = '<p>1 / 2</p>';
    value.content['en-US'].text = 'Keep!';
    const published = version(value);
    value.content['zh-CN'].html = '<p>3 / 4</p>';
    value.content['en-US'].text = 'Keep';
    api.get.mockResolvedValue({ ...value, published_version: 5 });
    api.version.mockResolvedValue(published);
    render(value);
    await flushPromises();
    const scroll = vi.fn();
    (wrapper.get('.comparison-body').element as HTMLElement).scrollTo = scroll;
    expect(wrapper.get('.change-position').text()).toBe('changePosition 1/3');
    await wrapper.get('.next-change').trigger('click');
    expect(wrapper.get('.change-position').text()).toBe('changePosition 2/3');
    expect(wrapper.get('ins.active-change').text()).toBe('4');
    expect(scroll).toHaveBeenCalledOnce();
    await wrapper.get('#mail-diff-unchanged').trigger('click');
    expect(wrapper.get('ins.active-change').text()).toBe('4');
    await wrapper.get('.next-change').trigger('click');
    expect(wrapper.get('del.active-change').text()).toBe('!');
    await wrapper.get('.next-change').trigger('click');
    expect(wrapper.get('.change-position').text()).toBe('changePosition 1/3');
    await wrapper.get('.previous-change').trigger('click');
    expect(wrapper.get('.change-position').text()).toBe('changePosition 3/3');
    await wrapper.setProps({ draft: { ...value, content: published.content } });
    expect(wrapper.get('.change-position').text()).toBe('changePosition 0/0');
    expect(wrapper.get('.next-change').attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('.previous-change').attributes('disabled'),
    ).toBeDefined();
  });
  it('loads the newest published snapshot without replacing or saving local edits', async () => {
    const value = draft();
    const published = version(value);
    published.content['zh-CN'].subject = 'Published subject';
    value.content['zh-CN'].subject = 'Unsaved subject';
    value.content['en-US'].html =
      '<img data-unsafe="true" src="x" onerror="alert(1)">';
    api.get.mockResolvedValue({ ...draft(), published_version: 5 });
    api.version.mockResolvedValue(published);
    render(value);
    await flushPromises();
    expect(api.version).toHaveBeenCalledWith(3, 5);
    expect(wrapper.text()).toContain('publishedBaseline 5');
    expect(wrapper.text()).toContain('Published subject');
    expect(wrapper.text()).toContain('Unsaved subject');
    expect(wrapper.text()).toContain('dirty');
    expect(wrapper.find('img[data-unsafe]').exists()).toBe(false);
    expect(value.content['zh-CN'].subject).toBe('Unsaved subject');
    expect(api.update).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
  });
  it('supports unpublished drafts without requesting a nonexistent version', async () => {
    api.get.mockResolvedValue({ ...draft(), published_version: 0 });
    render();
    await flushPromises();
    expect(api.version).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('diffFirstPublish');
    expect(wrapper.findAll('.added').length).toBeGreaterThan(0);
  });
  it('shows a load error and retries without displaying a false empty comparison', async () => {
    const value = draft();
    api.get.mockResolvedValue({ ...value, published_version: 5 });
    api.version
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(version(value));
    render(value, false);
    await flushPromises();
    expect(wrapper.get('.load-warning button').isVisible()).toBe(true);
    expect(wrapper.text()).not.toContain('noContentDifferences');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('noContentDifferences');
    expect(wrapper.find('.load-warning').exists()).toBe(false);
  });
});

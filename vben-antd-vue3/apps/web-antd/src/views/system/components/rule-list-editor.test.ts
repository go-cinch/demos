import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import { afterEach, describe, expect, it, vi } from 'vitest';

import RuleListEditor from './rule-list-editor.vue';
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
let wrapper: VueWrapper<InstanceType<typeof RuleListEditor>>;
function setup(value: string) {
  wrapper = mount(RuleListEditor, { props: { value, label: 'Rules', 'onUpdate:value': (next: string) => { void wrapper.setProps({ value: next }); } } });
}
afterEach(() => wrapper?.unmount());
describe('rule list editor', () => {
  it('forwards form field attributes to its DOM container without Vue warnings', () => {
    const warnHandler = vi.fn();
    wrapper = mount(RuleListEditor, {
      props: { label: 'Rules' },
      attrs: { id: 'editor-action-resource', class: 'field-control', 'aria-describedby': 'rule-help' },
      global: { config: { warnHandler } },
    });
    const container = wrapper.get('.rule-list-editor');
    expect(container.attributes('id')).toBe('editor-action-resource');
    expect(container.classes()).toContain('field-control');
    expect(container.attributes('aria-describedby')).toBe('rule-help');
    expect(warnHandler).not.toHaveBeenCalled();
  });
  it('splits a pasted multiline rule into individual rows and preserves the API format', async () => {
    setup(''); await wrapper.get('.rule-entry textarea').setValue('GET|/user\nPOST|/user'); await wrapper.get('.rule-entry textarea').trigger('blur'); await flushPromises();
    expect(wrapper.findAll('.rule-entry textarea')).toHaveLength(2);
    expect(wrapper.props('value')).toBe('GET|/user\nPOST|/user');
  });
  it('removes a single rule and permits an explicit empty list', async () => {
    setup('GET|/user\nPOST|/user'); await wrapper.findAll('.rule-entry button')[0]!.trigger('click'); await flushPromises();
    expect(wrapper.props('value')).toBe('POST|/user');
    await wrapper.get('.rule-entry button').trigger('click'); await flushPromises();
    expect(wrapper.props('value')).toBe(''); expect(wrapper.findAll('.rule-entry')).toHaveLength(0);
  });
  it('adds another editable item without losing existing rules', async () => {
    setup('GET|/user'); await wrapper.get('.rule-add').trigger('click');
    await wrapper.findAll('.rule-entry textarea')[1]!.setValue('PATCH|/user/*'); await flushPromises();
    expect(wrapper.props('value')).toBe('GET|/user\nPATCH|/user/*');
  });
});

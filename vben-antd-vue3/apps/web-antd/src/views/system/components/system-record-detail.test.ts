import { mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import SystemRecordDetail from './system-record-detail.vue';

vi.mock('./group-members.vue', () => ({ default: { template: '<div />' } }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/stores', () => ({ useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }) }));

describe('shared record layout', () => {
  it.each([
    ['user', ['username', 'password', 'role_id', 'action_codes']],
    ['role', ['name', 'word', 'action_codes']],
    ['user-group', ['name', 'word', 'user_ids', 'action_codes']],
    ['action', ['name', 'group', 'word', 'resource', 'menu', 'button']],
    ['dictionary', ['key', 'name', 'value', 'description', 'enabled']],
    ['whitelist', ['category', 'resource']],
  ] as const)('renders every writable %s field once in creation mode', (resource, fields) => {
    const slots = Object.fromEntries(fields.map((field) => [`field-${field}`, `<input aria-label="${field}" />`]));
    const wrapper = mount(SystemRecordDetail, { props: { record: null, resource, editing: true }, slots });
    expect(wrapper.findAll('input')).toHaveLength(fields.length);
    for (const field of fields) expect(wrapper.findAll(`input[aria-label="${field}"]`)).toHaveLength(1);
    expect(wrapper.text()).not.toContain('system-editor.recordInfo');
    wrapper.unmount();
  });
});

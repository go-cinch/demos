import { mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import SystemRecordDetail from './system-record-detail.vue';

vi.mock('./permission-detail.vue', () => ({ default: { props: ['actions', 'codes'], template: '<div data-testid="permission-detail" />' } }));
vi.mock('./group-members.vue', () => ({ default: { template: '<div />' } }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/stores', () => ({ useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }) }));

describe('shared record layout', () => {
  it('renders a selected role summary without loading the full role permission graph', async () => {
    const wrapper = mount(SystemRecordDetail, {
      props: {
        resource: 'user',
        record: { id: 8, username: 'reader', role_summary: { id: 3, name: 'Summary role', word: 'reader' } },
      },
    });
    expect(wrapper.text()).toContain('Summary role');
    await wrapper.setProps({ record: { id: 8, username: 'reader', role_summary: null } });
    expect(wrapper.text()).not.toContain('Summary role');
    wrapper.unmount();
  });

  it('keeps technical rules in full JSON and renders the shared permission detail in their place', async () => {
    const wrapper = mount(SystemRecordDetail, {
      props: {
        resource: 'action',
        record: {
          id: 8,
          name: 'Read dictionary',
          resource: 'GET|/dictionary/{id}\nGRPC|/auth.v1.Dictionary/GetDictionary',
        },
      },
    });
    expect(wrapper.findAll('.detail-rule')).toHaveLength(0);
    expect(wrapper.find('[data-testid="permission-detail"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('/auth.v1.Dictionary/GetDictionary');
    await wrapper.get('.detail-raw .ant-collapse-header').trigger('click');
    expect(wrapper.get('.detail-raw pre').text()).toContain('GRPC|/auth.v1.Dictionary/GetDictionary');
    wrapper.unmount();
  });

  it('shows existing usernames as read-only facts and hides credential reset when no credential slots are authorized', () => {
    const wrapper = mount(SystemRecordDetail, { props: { resource: 'user', editing: true, record: { id: 8, username: 'managed-user', code: 'MANAGED8', status: 1, login_count: 1, wrong: 0, metadata: {}, actions: [], action_codes: [] } } });
    expect(wrapper.text()).toContain('managed-user');
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('.detail-password').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ['user', ['username', 'password', 'role_id', 'action_codes']],
    ['role', ['name', 'word', 'action_codes']],
    ['user-group', ['name', 'word', 'user_ids', 'action_codes']],
    ['action', ['name', 'group', 'word', 'resource', 'menu', 'button']],
    ['dictionary', ['key', 'name', 'value', 'description', 'enabled']],
  ] as const)('renders every writable %s field once in creation mode', (resource, fields) => {
    const slots = Object.fromEntries(fields.map((field) => [`field-${field}`, `<input aria-label="${field}" />`]));
    const wrapper = mount(SystemRecordDetail, { props: { record: null, resource, editing: true }, slots });
    expect(wrapper.findAll('input')).toHaveLength(fields.length);
    for (const field of fields) expect(wrapper.findAll(`input[aria-label="${field}"]`)).toHaveLength(1);
    expect(wrapper.text()).not.toContain('system-editor.recordInfo');
    wrapper.unmount();
  });
});

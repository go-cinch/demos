import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import { Pagination } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listUserGroupMembers } from '#/api';

import GroupMembers from './group-members.vue';
vi.mock('#/api', () => ({ listUserGroupMembers: vi.fn() }));
vi.mock('#/locales', () => ({ $t: (key: string, params?: unknown) => `${key}${params ? JSON.stringify(params) : ''}` }));
vi.mock('./association-editor.vue', () => ({ default: { props: ['value', 'groupId'], emits: ['update:value'], template: '<button class="add-test" @click="$emit(\'update:value\', [1001])">Add</button>' } }));
const member = (id: number) => ({ id, username: `User ${id}`, code: `CODE${id}` });
const result = (id = 1) => ({ items: [member(id)], t: 1000, p: 1, s: 20 });
let wrapper: VueWrapper<InstanceType<typeof GroupMembers>>;
function setup(editable = false) {
  wrapper = mount(GroupMembers, { props: { groupId: 7, count: 1000, editable, value: { added: [], removed: [] }, 'onUpdate:value': (value) => { void wrapper.setProps({ value }); } } });
}
beforeEach(() => { vi.useFakeTimers(); vi.mocked(listUserGroupMembers).mockResolvedValue(result()); });
afterEach(() => { wrapper?.unmount(); vi.resetAllMocks(); vi.useRealTimers(); });
describe('paged group members', () => {
  it('loads only one page and retains removals across pages and undo', async () => {
    setup(true); await flushPromises();
    expect(listUserGroupMembers).toHaveBeenCalledWith(7, { p: 1, s: 20, q: undefined });
    expect(wrapper.findAll('.member-row')).toHaveLength(1);
    await wrapper.get('.member-row button').trigger('click');
    expect(wrapper.props('value')).toEqual({ added: [], removed: [1] });
    vi.mocked(listUserGroupMembers).mockResolvedValueOnce(result(21));
    wrapper.getComponent(Pagination).vm.$emit('change', 2); await flushPromises();
    expect(listUserGroupMembers).toHaveBeenLastCalledWith(7, { p: 2, s: 20, q: undefined });
    await wrapper.get('.member-row button').trigger('click');
    await wrapper.get('.add-test').trigger('click');
    expect(wrapper.props('value')).toEqual({ added: [1001], removed: [1, 21] });
    await wrapper.get('.member-row button').trigger('click');
    expect(wrapper.props('value')).toEqual({ added: [1001], removed: [1] });
  });
  it('ignores stale searches and stale group responses', async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    vi.mocked(listUserGroupMembers).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    setup();
    await wrapper.get('input').setValue(' new ');
    await vi.advanceTimersByTimeAsync(250); await flushPromises();
    expect(listUserGroupMembers).toHaveBeenLastCalledWith(7, { p: 1, s: 20, q: 'new' });
    resolve(result(99)); await flushPromises();
    expect(wrapper.text()).not.toContain('User 99');
    await wrapper.setProps({ groupId: 8 }); await flushPromises();
    expect(listUserGroupMembers).toHaveBeenLastCalledWith(8, { p: 1, s: 20, q: undefined });
    expect(wrapper.find('.member-row button').exists()).toBe(false);
  });
  it('supports retry and empty results without losing pending changes', async () => {
    vi.mocked(listUserGroupMembers).mockRejectedValueOnce(new Error('offline'));
    setup(true); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    vi.mocked(listUserGroupMembers).mockResolvedValueOnce({ items: [], t: 0, p: 1, s: 20 });
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('system-cards.noMembers');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});

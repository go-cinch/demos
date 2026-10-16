import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listActions, listUsers } from '#/api';
import { msgApi } from '#/api/msg';

import AssociationEditor from './association-editor.vue';

vi.mock('#/api', () => ({ listActions: vi.fn(), listUsers: vi.fn() }));
vi.mock('#/api/msg', () => ({ msgApi: { users: vi.fn() } }));
vi.mock('#/locales', () => ({ $t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}` }));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
vi.mock('./permission-card.vue', () => ({ default: { props: ['permission', 'code'], template: '<article :data-code="code">{{ permission?.name || code }}<slot name="action" /></article>' } }));
const action = (code: string) => ({ code, id: 1, name: `Permission ${code}`, word: `permission.${code}`, group: 'System', resource: 'GET|/user', menu: '/system/user', button: '', created_at: 1, updated_at: 1 });
const result = (codes: string[], p = 1, t = codes.length) => ({ items: codes.map(action), p, s: 20, t });
let wrapper: VueWrapper<InstanceType<typeof AssociationEditor>>;
function setup(value: (number | string)[] = [], kind: 'action' | 'recipient' | 'user' = 'action') {
  wrapper = mount(AssociationEditor, { props: { value, kind, records: value.filter((key): key is string => typeof key === 'string').map(action), 'onUpdate:value': (next: (number | string)[]) => { void wrapper.setProps({ value: next }); } } });
  return wrapper;
}
async function open() { await wrapper.get('.association-add').trigger('click'); await flushPromises(); }
beforeEach(() => { vi.useFakeTimers(); vi.mocked(listActions).mockResolvedValue(result(['A', 'B'])); vi.mocked(listUsers).mockResolvedValue({ items: [], p: 1, s: 20, t: 0 }); });
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('association editor', () => {
  it('forwards form field attributes to its DOM container without Vue warnings', () => {
    const warnHandler = vi.fn();
    wrapper = mount(AssociationEditor, {
      props: { kind: 'action' },
      attrs: { id: 'editor-user-action_codes', class: 'field-control', 'aria-describedby': 'permission-help' },
      global: { config: { warnHandler } },
    });
    const container = wrapper.get('.association-editor');
    expect(container.attributes('id')).toBe('editor-user-action_codes');
    expect(container.classes()).toContain('field-control');
    expect(container.attributes('aria-describedby')).toBe('permission-help');
    expect(warnHandler).not.toHaveBeenCalled();
  });
  it('keeps selected permissions, adds cards only on confirmation, and disables duplicates', async () => {
    setup(['A']); await open();
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect(inputs[0]!.attributes('disabled')).toBeDefined();
    await inputs[1]!.setValue(true);
    expect(wrapper.findAll('article')).toHaveLength(1);
    await wrapper.get('footer button').trigger('click'); await flushPromises();
    expect(wrapper.props('value')).toEqual(['A', 'B']);
    expect(wrapper.findAll('article')).toHaveLength(2);
  });
  it('distinguishes permission rule fields and flags resource wildcards only', async () => {
    const items = [
      { ...action('WILD'), resource: 'GET|/reports/*\nPOST|/reports', menu: '/reports\n/reports/detail', button: 'reports.read\nreports.export' },
      { ...action('EXACT'), resource: 'GET|/reports', menu: '/reports/*', button: '*' },
      { ...action('ALL'), resource: '*', menu: '', button: '' },
    ];
    vi.mocked(listActions).mockResolvedValue({ items, p: 1, s: 20, t: items.length });
    setup(); await open();
    const rows = wrapper.findAll('.association-results > .association-result');
    expect(rows[0]!.get('[data-permission-field="resource"]').text()).toContain('system.fields.resourceRules');
    expect(rows[0]!.findAll('[data-permission-field="resource"] code').map((node) => node.text())).toEqual(['GET|/reports/*', 'POST|/reports']);
    expect(rows[0]!.findAll('[data-permission-field="menu"] code').map((node) => node.text())).toEqual(['/reports', '/reports/detail']);
    expect(rows[0]!.findAll('[data-permission-field="button"] code').map((node) => node.text())).toEqual(['reports.read', 'reports.export']);
    expect(rows[0]!.get('.result-risk').text()).toContain('system-editor.highRiskPermission');
    expect(rows[1]!.find('.result-risk').exists()).toBe(false);
    expect(rows[2]!.get('.result-risk').text()).toContain('system-editor.highRiskPermission');
    expect(rows[2]!.get('[data-permission-field="menu"] .result-rule-values').text()).toBe('—');
    expect(rows[2]!.get('[data-permission-field="button"] .result-rule-values').text()).toBe('—');
    expect(rows[0]!.get('input[type="checkbox"]').attributes('disabled')).toBeUndefined();
  });
  it('removes only the association and restores its original ordering with undo', async () => {
    setup(['A', 'B']); await wrapper.findAll('.remove-association')[0]!.trigger('click'); await flushPromises();
    expect(wrapper.props('value')).toEqual(['B']);
    await wrapper.get('.association-undo button').trigger('click'); await flushPromises();
    expect(wrapper.props('value')).toEqual(['A', 'B']);
    expect(listActions).not.toHaveBeenCalled();
  });
  it('discards pending choices when the picker closes', async () => {
    setup(); await open(); await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(true);
    await wrapper.get('.association-picker header button').trigger('click'); await open();
    expect(wrapper.props('value')).toEqual([]);
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
  });
  it('searches once with q and ignores responses from a superseded search', async () => {
    let resolveOld!: (value: ReturnType<typeof result>) => void;
    vi.mocked(listActions).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    setup(); await wrapper.get('.association-add').trigger('click');
    await wrapper.get('.association-search input').setValue('abc');
    await vi.advanceTimersByTimeAsync(250); await flushPromises();
    expect(listActions).toHaveBeenCalledTimes(2); // Initial load and one keyword request.
    expect(listActions).toHaveBeenLastCalledWith({ f: 'id,code,name,group,word,resource,menu,button', p: 1, s: 20, q: 'abc' });
    resolveOld(result(['STALE'])); await flushPromises();
    expect(wrapper.text()).not.toContain('Permission STALE');
    expect(wrapper.text()).toContain('Permission B');
  });
  it('shows a retry state without discarding selected cards on a failed search', async () => {
    vi.mocked(listActions).mockRejectedValueOnce(new Error('offline'));
    setup(['A']); await open(); expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.props('value')).toEqual(['A']);
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
  });
  it('loads later pages without dropping first-page results', async () => {
    vi.mocked(listActions).mockResolvedValueOnce(result(['A'], 1, 21)).mockResolvedValueOnce(result(['B'], 2, 21));
    setup(); await open(); await wrapper.get('.association-results > button').trigger('click'); await flushPromises();
    expect(listActions).toHaveBeenLastCalledWith({ f: 'id,code,name,group,word,resource,menu,button', p: 2, q: undefined, s: 20 });
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
  });
  it('searches members once with a trimmed keyword', async () => {
    setup([], 'user'); await open();
    vi.mocked(listUsers).mockClear();
    await wrapper.get('.association-search input').setValue('  member42  ');
    await vi.advanceTimersByTimeAsync(250); await flushPromises();
    expect(listUsers).toHaveBeenCalledExactlyOnceWith({ f: 'id,username,code', p: 1, q: 'member42', s: 20 });
    expect(listActions).not.toHaveBeenCalled();
  });
  it('uses one keyword and the server total across permission pages', async () => {
    setup(); await open();
    vi.mocked(listActions).mockClear();
    vi.mocked(listActions).mockResolvedValueOnce(result(['MATCH1'], 1, 21)).mockResolvedValueOnce(result(['MATCH2'], 2, 21));
    await wrapper.get('.association-search input').setValue('match');
    await vi.advanceTimersByTimeAsync(250); await flushPromises();
    await wrapper.get('.association-results > button').trigger('click'); await flushPromises();
    expect(listActions).toHaveBeenCalledTimes(2);
    expect(listActions).toHaveBeenNthCalledWith(1, { f: 'id,code,name,group,word,resource,menu,button', p: 1, q: 'match', s: 20 });
    expect(listActions).toHaveBeenNthCalledWith(2, { f: 'id,code,name,group,word,resource,menu,button', p: 2, q: 'match', s: 20 });
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
    expect(wrapper.find('.association-results > button').exists()).toBe(false);
  });
  it('uses the recipient endpoint and keeps numeric IDs', async () => {
    vi.mocked(msgApi.users).mockResolvedValue([{ id: 42, username: 'recipient' }]);
    setup([], 'recipient'); await open(); await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('footer button').trigger('click'); await flushPromises();
    expect(wrapper.props('value')).toEqual([42]); expect(listUsers).not.toHaveBeenCalled();
    expect(wrapper.get('.member-card').text()).toContain('recipient');
  });
});


it('filters already joined members on the server without loading their IDs', async () => {
  setup([], 'user');
  await wrapper.setProps({ groupId: 7 });
  await open();
  expect(listUsers).toHaveBeenLastCalledWith({ f: 'id,username,code', p: 1, s: 20, q: undefined, exclude_user_group_id: 7 });
});

it('Escape dismisses suggestions without clearing the member query or results', async () => {
  vi.mocked(listUsers).mockResolvedValue({ items: [{ id: 42, username: 'member42', code: 'MEMBER42', action_codes: [], actions: [], created_at: 0, updated_at: 0, status: 1, metadata: {}, login_count: 0, wrong: 0 }], p: 1, s: 20, t: 1 });
  setup([], 'user');
  await open();
  const input = wrapper.get('.association-search input');
  await input.setValue('member42');
  await vi.advanceTimersByTimeAsync(250);
  await flushPromises();
  const calls = vi.mocked(listUsers).mock.calls.length;
  await input.trigger('keydown', { key: 'Escape' });
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
  expect((input.element as HTMLInputElement).value).toBe('member42');
  expect(wrapper.find('.association-picker').exists()).toBe(true);
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1);
  expect(listUsers).toHaveBeenCalledTimes(calls);
});

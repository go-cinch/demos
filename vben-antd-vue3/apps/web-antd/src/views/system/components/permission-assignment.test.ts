import type {
  ActionConfig,
  ActionResourceBinding,
  PermissionCatalog,
} from '#/api/system';

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PermissionAssignment from './permission-assignment.vue';
import PermissionResourceEditor from './permission-resource-editor.vue';

const api = vi.hoisted(() => ({
  getPermissionCatalog: vi.fn(),
  listActions: vi.fn(),
  refreshI18nCatalog: vi.fn(),
}));
vi.mock('#/api/system', () => api);
vi.mock('#/locales', () => ({
  $t: (key: string) => key,
  refreshI18nCatalog: api.refreshI18nCatalog,
}));
vi.mock('./permission-resource-editor.vue', () => ({
  default: {
    props: ['catalog', 'scope', 'config', 'disabled', 'assignment'],
    emits: ['update:scope', 'update:config'],
    template: '<div data-testid="resource-editor" />',
  },
}));

const binding = (
  scope = 'admin',
  features: string[] = ['query'],
): ActionResourceBinding => ({
  resource_key: `${scope}:system:user`,
  operation: 'read',
  feature_keys: features,
});
const definition = (code = 'A', scope = 'admin') => ({
  code,
  word: `${scope}:read:system:user`,
  config: { bindings: [binding(scope)], ui: [], endpoints: [] },
});
const config = (bindings: ActionResourceBinding[]): ActionConfig => ({
  bindings,
  ui: [],
  endpoints: [],
});
const catalog: PermissionCatalog = {
  scopes: ['admin', 'mini'],
  operations: ['read'],
  resource_catalog: {
    resources: Object.fromEntries(
      ['admin', 'mini'].map((scope) => [
        `${scope}:system:user`,
        {
          kind: 'resource' as const,
          sort: 1,
          operations: { read: { entry_keys: [], button_keys: ['query'] } },
        },
      ]),
    ),
    buttons: { query: { btn: [], http: [], grpc: [] } },
  },
};
let wrapper: ReturnType<typeof mount>;
beforeEach(() => {
  vi.resetAllMocks();
  api.getPermissionCatalog.mockResolvedValue(catalog);
  api.refreshI18nCatalog.mockResolvedValue(undefined);
  api.listActions.mockResolvedValue({
    items: [definition()],
    p: 1,
    s: 100,
    t: 1,
  });
});
afterEach(() => wrapper?.unmount());

async function start(value = ['A'], bindings?: ActionResourceBinding[]) {
  wrapper = mount(PermissionAssignment, {
    props: { value, bindings },
    attrs: { id: 'permissions', 'aria-describedby': 'permission-help' },
  });
  await flushPromises();
}
async function update(bindings: ActionResourceBinding[]) {
  wrapper
    .getComponent(PermissionResourceEditor)
    .vm.$emit('update:config', config(bindings));
  await flushPromises();
}

describe('resource based permission assignment', () => {
  it('hydrates definitions once without emitting a change for an untouched form', async () => {
    await start(['A', 'A']);
    expect(api.listActions).toHaveBeenCalledExactlyOnceWith({
      code: 'A,',
      f: 'id,code,word,config',
      p: 1,
      s: 100,
    });
    expect(
      wrapper.getComponent(PermissionResourceEditor).props('config'),
    ).toMatchObject({ bindings: [binding()] });
    expect(wrapper.emitted('update:bindings')).toBeUndefined();
    expect(wrapper.emitted('validity')?.at(-1)).toEqual(['']);
    expect(wrapper.get('.permission-assignment').attributes('id')).toBe(
      'permissions',
    );
  });

  it('emits explicit clearing and returns to an unchanged payload when the selection is restored', async () => {
    await start();
    await update([]);
    expect(wrapper.emitted('update:bindings')?.at(-1)).toEqual([[]]);
    await update([binding()]);
    expect(wrapper.emitted('update:bindings')?.at(-1)).toEqual([undefined]);
  });

  it('preserves selections in other scopes while updating the visible scope', async () => {
    api.listActions.mockResolvedValue({
      items: [definition(), definition('B', 'mini')],
      p: 1,
      s: 100,
      t: 2,
    });
    await start(['A', 'B']);
    await update([]);
    expect(wrapper.emitted('update:bindings')?.at(-1)).toEqual([
      [binding('mini')],
    ]);
    wrapper
      .getComponent(PermissionResourceEditor)
      .vm.$emit('update:scope', 'mini');
    await flushPromises();
    expect(
      wrapper.getComponent(PermissionResourceEditor).props('config'),
    ).toMatchObject({ bindings: [binding('mini')] });
  });

  it('honors an explicit empty draft and ignores events while disabled', async () => {
    await start(['A'], []);
    expect(
      wrapper.getComponent(PermissionResourceEditor).props('config'),
    ).toMatchObject({ bindings: [] });
    await wrapper.setProps({ disabled: true });
    await update([binding()]);
    expect(wrapper.emitted('update:bindings')).toBeUndefined();
  });

  it('removes revoked definitions only in the pending form payload', async () => {
    await start(['A', 'deleted']);
    expect(wrapper.text()).toContain('permission-assignment.deletedActions');
    expect(wrapper.emitted('update:bindings')?.at(-1)).toEqual([[binding()]]);
    expect(wrapper.emitted('validity')?.at(-1)).toEqual(['']);
  });

  it('distinguishes a failed lookup from revoked definitions and allows retry', async () => {
    api.listActions.mockRejectedValueOnce(new Error('offline'));
    await start();
    expect(wrapper.text()).toContain('permission-assignment.resourceLoadError');
    expect(wrapper.emitted('update:bindings')).toBeUndefined();
    expect(wrapper.emitted('validity')?.at(-1)).toEqual([
      'permission-assignment.resourceLoadError',
    ]);
    await wrapper.get('.ant-alert button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('validity')?.at(-1)).toEqual(['']);
    expect(wrapper.findComponent(PermissionResourceEditor).exists()).toBe(true);
  });

  it('discards a late definition response after the association changes', async () => {
    let finish!: (value: unknown) => void;
    api.listActions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await start();
    api.listActions.mockResolvedValue({
      items: [definition('B', 'mini')],
      p: 1,
      s: 100,
      t: 1,
    });
    await wrapper.setProps({ value: ['B'] });
    await flushPromises();
    finish({ items: [definition()], p: 1, s: 100, t: 1 });
    await flushPromises();
    expect(wrapper.getComponent(PermissionResourceEditor).props('scope')).toBe(
      'mini',
    );
    expect(
      wrapper.getComponent(PermissionResourceEditor).props('config'),
    ).toMatchObject({ bindings: [binding('mini')] });
  });
});

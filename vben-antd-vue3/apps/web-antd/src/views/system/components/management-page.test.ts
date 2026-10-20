import type { ComponentPublicInstance } from 'vue';

import { flushPromises, shallowMount } from '@vue/test-utils';
import { reactive, ref } from 'vue';

import { Button } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ManagementDrawer from './management-drawer.vue';
import ManagementPage from './management-page.vue';
import SystemResourceCards from './system-resource-cards.vue';

const mock = vi.hoisted(() => ({
  api: Object.fromEntries(
    [
      'createAction',
      'createDictionary',
      'createRole',
      'createUser',
      'createUserGroup',
      'deleteActions',
      'deleteDictionaries',
      'deleteRoles',
      'deleteUserGroups',
      'deleteUsers',
      'getAction',
      'getSystemRecord',
      'listActionGroups',
      'listActions',
      'listDictionaries',
      'listRoles',
      'listUserGroups',
      'listUsers',
      'updateAction',
      'updateDictionary',
      'updateRole',
      'updateUser',
      'updateUserGroup',
      'getPermissionCatalog',
      'listUserGroupMembers',
    ].map((name) => [name, vi.fn()]),
  ),
  summary: vi.fn(),
  validate: vi.fn(),
  access: {} as { page: boolean; button: boolean; assign: boolean },
  route: {} as {
    path: string;
    fullPath: string;
    query: Record<string, string>;
  },
}));
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>();
  return {
    ...actual,
    message: { ...actual.message, success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});
vi.mock('#/api', () => mock.api);
vi.mock('#/api/system', () => mock.api);
vi.mock('#/api/msg', () => ({ msgApi: {} }));
vi.mock('#/api/system/insights', () => ({ getSystemSummary: mock.summary }));
vi.mock('vue-router', () => ({ useRoute: () => mock.route }));
vi.mock('#/router/routes', () => ({ accessRoutes: [] }));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<main><slot /></main>' },
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
}));
vi.mock('@vben/locales', () => ({
  $te: () => false,
  i18n: { global: { locale: { value: 'en-US' } } },
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => key,
  catalogLabel: (_kind: string, key: string) => key,
  refreshI18nCatalog: vi.fn(),
}));
vi.mock('#/locales/catalog', () => ({
  catalogDefaultLocale: () => 'en-US',
  catalogGroupOrder: () => [],
  catalogGroupWords: () => [],
  catalogMessages: () => ({}),
  catalogLanguages: () => [],
}));
vi.mock('#/composables/use-default-page-size', () => ({
  useDefaultPageSize: () => ref(20),
}));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({
    hasPage: () => mock.access.page,
    hasButton: () => mock.access.button,
    canManagePermission: () => mock.access.assign,
    hasAllPermissions: ref(false),
    canManageDeveloper: ref(false),
  }),
}));
// Keep form validation and drawer rendering local; the page owns hydration and payloads.
vi.mock('./management-form.vue', () => ({
  default: {
    props: ['model', 'rules', 'disabled'],
    methods: { validate: () => mock.validate(), clearValidate: () => {} },
    template: '<form><slot /></form>',
  },
}));
vi.mock('./management-drawer.vue', () => ({
  default: {
    props: ['open', 'mode', 'busy'],
    template: '<aside v-if="open"><slot /><slot name="footer" /></aside>',
  },
}));

let wrapper: ReturnType<typeof shallowMount>;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mock.access = reactive({ page: true, button: true, assign: true });
  mock.route = reactive({
    path: '/system/role',
    fullPath: '/system/role',
    query: {},
  });
  mock.validate.mockResolvedValue(undefined);
  for (const name of [
    'listActions',
    'listDictionaries',
    'listRoles',
    'listUserGroups',
    'listUsers',
  ])
    mock.api[name]!.mockResolvedValue({
      items: [{ id: 7, name: 'List preview', action_codes: [] }],
      p: 1,
      s: 20,
      t: 1,
    });
  mock.summary.mockResolvedValue({
    total: 1,
    counts: {},
    groups: [],
    trend: [],
  });
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});

async function start(
  resource: 'action' | 'dictionary' | 'role' | 'user' | 'user-group' = 'role',
) {
  mock.route.path = mock.route.fullPath = `/system/${resource}`;
  wrapper = shallowMount(ManagementPage, {
    props: { resource },
    global: {
      renderStubDefaultSlot: true,
      stubs: { ManagementForm: false, ManagementDrawer: false },
    },
  });
  await flushPromises();
}
async function create() {
  const button = wrapper
    .findAllComponents(Button)
    .find((button) => button.text() === 'system.common.create');
  expect(button).toBeDefined();
  button!.vm.$emit('click');
  await flushPromises();
}
async function save() {
  wrapper.getComponent<ComponentPublicInstance>('[data-testid="management-save"]').vm.$emit('click');
  await flushPromises();
}

describe('management page request and editor flows', () => {
  it.each([
    ['action', 'listActions'],
    ['dictionary', 'listDictionaries'],
    ['role', 'listRoles'],
    ['user', 'listUsers'],
    ['user-group', 'listUserGroups'],
  ] as const)(
    'loads the current sparse projection for %s',
    async (resource, list) => {
      await start(resource);
      expect(mock.api[list]).toHaveBeenCalledWith(
        expect.objectContaining({ p: 1, s: 20, f: expect.any(String) }),
      );
      expect(mock.summary).toHaveBeenCalledWith(
        resource,
        resource === 'user' ? { days: 14, time_zone: 'Asia/Shanghai' } : {},
      );
    },
  );

  it('makes no list, summary or detail request without page access', async () => {
    mock.access.page = false;
    mock.access.button = false;
    await start();
    expect(mock.api.listRoles).not.toHaveBeenCalled();
    expect(mock.summary).not.toHaveBeenCalled();
    expect(mock.api.getSystemRecord).not.toHaveBeenCalled();
  });

  it('hydrates an editable record before saving only changed fields', async () => {
    mock.api.getSystemRecord!.mockResolvedValue({
      id: 7,
      name: 'Full record',
      word: 'reader',
      action_codes: ['A'],
    });
    mock.api.updateRole!.mockResolvedValue({
      id: 7,
      name: 'Renamed',
      word: 'reader',
      action_codes: ['A'],
    });
    await start();
    wrapper
      .getComponent(SystemResourceCards)
      .vm.$emit('edit', { id: 7, name: 'List preview' });
    await flushPromises();
    expect(mock.api.getSystemRecord).toHaveBeenCalledWith('role', 7);
    const model = wrapper.getComponent<ComponentPublicInstance<{ model: Record<string, unknown> }>>('[data-testid="management-editor"]').props('model') as Record<
      string,
      unknown
    >;
    expect(model.name).toBe('Full record');
    model.name = 'Renamed';
    await save();
    expect(mock.api.updateRole).toHaveBeenCalledExactlyOnceWith(7, {
      name: 'Renamed',
    });
    expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe('detail');
  });

  it('retains the draft and idempotency key across an uncertain creation failure', async () => {
    mock.api
      .createRole!.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 8,
        name: 'New role',
        word: 'new-role',
        action_codes: [],
      });
    await start();
    await create();
    const model = wrapper.getComponent<ComponentPublicInstance<{ model: Record<string, unknown> }>>('[data-testid="management-editor"]').props('model') as Record<
      string,
      unknown
    >;
    Object.assign(model, { name: 'New role', word: 'new-role' });
    await save();
    expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe('create');
    expect(wrapper.getComponent<ComponentPublicInstance<{ model: Record<string, unknown> }>>('[data-testid="management-editor"]').props('model')).toMatchObject({
      name: 'New role',
    });
    await save();
    expect(mock.api.createRole).toHaveBeenCalledTimes(2);
    expect(mock.api.createRole!.mock.calls[0]![0]).toEqual(expect.any(String));
    expect(mock.api.createRole!.mock.calls[1]).toEqual(
      mock.api.createRole!.mock.calls[0],
    );
  });

  it('rechecks assignment authority before submitting retained form state', async () => {
    mock.api.createRole!.mockResolvedValue({
      id: 8,
      name: 'New role',
      word: 'new-role',
    });
    await start();
    await create();
    const model = wrapper.getComponent<ComponentPublicInstance<{ model: Record<string, unknown> }>>('[data-testid="management-editor"]').props('model') as Record<
      string,
      unknown
    >;
    Object.assign(model, {
      name: 'New role',
      word: 'new-role',
      action_codes: ['A'],
      action_bindings: [],
    });
    mock.access.assign = false;
    await save();
    expect(mock.api.createRole).toHaveBeenCalledWith(expect.any(String), {
      name: 'New role',
      word: 'new-role',
    });
  });

  it('does not submit after validation fails or write permission is revoked', async () => {
    await start();
    await create();
    mock.validate.mockRejectedValueOnce(new Error('required'));
    await save();
    expect(mock.api.createRole).not.toHaveBeenCalled();
    mock.access.button = false;
    await flushPromises();
    expect(wrapper.find('[data-testid="management-save"]').exists()).toBe(
      false,
    );
    expect(mock.api.createRole).not.toHaveBeenCalled();
  });
});

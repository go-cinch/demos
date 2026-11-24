import type { ComponentPublicInstance } from 'vue';

import { flushPromises, shallowMount } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';

import { Button, InputPassword, Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import ActionGroupDialog from './action-group-dialog.vue';
import ActionGroupNav from './action-group-nav.vue';
import ManagementDrawer from './management-drawer.vue';
import ManagementPage from './management-page.vue';
import ManagementRecordForm from './management-record-form.vue';
import ManagementResults from './management-results.vue';
import ManagementUserDialogs from './management-user-dialogs.vue';
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
      'updateActionGroup',
      'reorderActionGroups',
      'updateRole',
      'updateUser',
      'resetUserPassword',
      'updateUserGroup',
      'getPermissionCatalog',
      'listUserGroupMembers',
    ].map((name) => [name, vi.fn()]),
  ),
  summary: vi.fn(),
  emailEnabled: false,
  validate: vi.fn(),
  access: {} as { page: boolean; button: boolean; controls?: string[] },
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
    message: {
      ...actual.message,
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});
vi.mock('#/api', () => mock.api);
vi.mock('#/api/system', () => mock.api);
vi.mock('#/api/msg', () => ({ msgApi: {} }));
vi.mock('#/api/core/auth', () => ({ resetUserTOTPApi: vi.fn() }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ logout: vi.fn() }) }));
vi.mock('#/store/system-properties', () => ({
  emailEnabled: {
    get value() {
      return mock.emailEnabled;
    },
  },
  totpEnabled: { value: false },
}));
vi.mock('#/api/system/insights', () => ({ getSystemSummary: mock.summary }));
vi.mock('vue-router', () => ({ useRoute: () => mock.route }));
vi.mock('#/router/routes', () => ({ accessRoutes: [] }));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<main><slot /></main>' },
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
vi.mock('@vben/stores', () => ({
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
  useUserStore: () => ({ userInfo: { userId: 1 } }),
}));
vi.mock('@vben/locales', () => ({
  $placeholder: (key: string) => key,
  $te: () => false,
  i18n: { global: { locale: { value: 'en-US' } } },
}));
vi.mock('#/locales', async () => {
  const { default: actionEditor } =
    await import('#/locales/langs/en-US/action-editor.json');
  return {
    $t: (key: string, values?: { name?: string }) =>
      key === 'action-editor.editTitle'
        ? actionEditor.editTitle.replace('{name}', values?.name ?? '')
        : key,
    catalogLabel: (_kind: string, key: string) => key,
    refreshI18nCatalog: vi.fn(),
  };
});
vi.mock('#/locales/catalog', () => ({
  catalogDefaultLocale: () => 'en-US',
  catalogGroupOrder: () => [],
  catalogGroupNames: () => ({}),
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
    hasButton: (key: string) =>
      mock.access.button && (mock.access.controls?.includes(key) ?? true),
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
    props: ['open', 'mode', 'busy', 'title'],
    template:
      '<aside v-if="open"><slot name="description" /><slot /><slot name="footer" /></aside>',
  },
}));

let wrapper: ReturnType<typeof shallowMount>;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mock.emailEnabled = false;
  mock.access = reactive({ page: true, button: true });
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
    required(mock.api[name]).mockResolvedValue({
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
      stubs: {
        ActionGroupNav: false,
        ManagementForm: false,
        ManagementDrawer: false,
        ManagementResults: false,
        TableColumnSelector: false,
        ManagementRecordPanel: false,
        ManagementRecordForm: false,
        ACheckbox: false,
        Checkbox: false,
        ManagementToolbar: {
          template:
            '<section data-testid="column-controls"><slot name="columns" /></section>',
        },
      },
    },
  });
  await flushPromises();
}
async function create() {
  const button = wrapper
    .findAllComponents(Button)
    .find(
      (button) =>
        button.props('type') === 'primary' &&
        button.text() === 'system.common.create',
    );
  expect(button).toBeDefined();
  required(button).vm.$emit('click');
  await flushPromises();
}
async function save() {
  wrapper
    .getComponent<ComponentPublicInstance>('[data-testid="management-save"]')
    .vm.$emit('click');
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

  it.each([false, true])(
    'maps each visible user column to its list fields (email enabled: %s)',
    async (emailEnabled) => {
      mock.emailEnabled = emailEnabled;
      await start('user');

      const requiredFields = ['id', 'username', 'code', 'status', 'metadata'];
      const columnFields = [
        ['system.fields.id', 'id', false],
        ['system.fields.username', 'username', true],
        ['system.fields.userCode', 'code', false],
        ['system.fields.role', 'role_summary', true],
        ['system.fields.status', 'status', true],
        ['system-insights.loginCount', 'login_count', true],
        ['system-insights.lastLogin', 'last_logged_in_at', true],
        ['system.fields.permissions', 'action_codes', false],
        ['system.fields.createdAt', 'created_at', false],
        ['system.fields.updatedAt', 'updated_at', false],
        ['system.fields.metadata', 'metadata', true],
        ['email-auth.email', 'email', true],
      ] as const;
      const controls = () =>
        wrapper.get('[data-testid="column-controls"]').findAll('label');
      const visible = new Set<string>(
        columnFields
          .filter(
            ([, field, selected]) =>
              selected && (field !== 'email' || emailEnabled),
          )
          .map(([, field]) => field),
      );
      const expectProjection = () => {
        const params = required(mock.api.listUsers).mock.lastCall?.[0];
        expect(params).toMatchObject({ p: 1, s: 20 });
        expect(params.f.split(',').toSorted()).toEqual(
          [...new Set([...requiredFields, ...visible])].toSorted(),
        );
      };

      expectProjection();
      for (const [label, field, initial] of columnFields) {
        const control = controls().find((item) => item.text() === label);
        const available = field !== 'email' || emailEnabled;
        expect(Boolean(control), label).toBe(available);
        if (!available) continue;
        expect(control, label).toBeDefined();
        const checkbox = required(control).get<HTMLInputElement>(
          'input[type="checkbox"]',
        );
        expect(checkbox.element.checked, label).toBe(initial);

        for (const checked of [!initial, initial]) {
          const calls = required(mock.api.listUsers).mock.calls.length;
          await checkbox.setValue(checked);
          await flushPromises();
          expect(checkbox.element.checked, label).toBe(checked);
          if (checked) visible.add(field);
          else visible.delete(field);
          expectProjection();
          expect(mock.api.listUsers, label).toHaveBeenCalledTimes(
            calls + (requiredFields.includes(field) ? 0 : 1),
          );
        }
      }
    },
  );

  it.each(['user', 'role', 'action', 'dictionary', 'user-group'] as const)(
    'clears bulk selection when the selection column is hidden in %s',
    async (resource) => {
      await start(resource);
      const results = wrapper.getComponent(ManagementResults);
      results.vm.$emit('update:viewMode', 'table');
      await flushPromises();
      results.vm.$emit('update:selectedRowKeys', [7]);
      await flushPromises();

      const bulkDelete = () =>
        wrapper
          .findAllComponents(Button)
          .some((button) => button.text() === 'system.common.deleteSelected');
      const label =
        resource === 'role'
          ? 'system.common.selectAll'
          : 'system.common.selection';
      const checkbox = required(
        wrapper
          .get('[data-testid="column-controls"]')
          .findAll('label')
          .find((item) => item.text() === label),
      ).get<HTMLInputElement>('input[type="checkbox"]');

      expect(bulkDelete()).toBe(true);
      expect(checkbox.element.checked).toBe(true);
      await checkbox.setValue(false);
      await flushPromises();
      expect(bulkDelete()).toBe(false);
      expect(results.props('selectedRowKeys')).toEqual([]);

      await checkbox.setValue(true);
      await flushPromises();
      expect(bulkDelete()).toBe(false);
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

  it.each(['user', 'role', 'action', 'dictionary', 'user-group'] as const)(
    'uses button grants for %s writes',
    async (resource) => {
      await start(resource);
      const { permissions } = wrapper.getComponent(ManagementResults).props();
      const record = { id: 7, config: {}, action_codes: [], member_count: 0 };
      expect(permissions.canAssignPermissions.value).toBe(
        ['role', 'user', 'user-group'].includes(resource),
      );
      expect(permissions.canCreate.value).toBe(true);
      expect(permissions.canUpdate.value).toBe(true);
      expect(permissions.canRemoveRecord(record)).toBe(true);
      expect(permissions.canSelectRecord(record)).toBe(true);
      await create();
      expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe(
        'create',
      );

      mock.access.button = false;
      expect(permissions.canAssignPermissions.value).toBe(false);
      expect(permissions.canCreate.value).toBe(false);
      expect(permissions.canUpdate.value).toBe(false);
      expect(permissions.canRemoveRecord(record)).toBe(false);
      expect(permissions.canSelectRecord(record)).toBe(false);
    },
  );

  it.each(['create', 'edit'] as const)(
    'saves user credentials, role and permissions with the %s button grant',
    async (control) => {
      mock.access.controls = [`admin:btn:system:user:${control}`];
      const saved = {
        id: 7,
        username: 'operator',
        role_id: 4,
        action_codes: [],
      };
      required(mock.api.getSystemRecord).mockResolvedValue({
        id: 7,
        username: 'original',
        role_id: 2,
        action_codes: [],
      });
      required(mock.api.createUser).mockResolvedValue(saved);
      required(mock.api.updateUser).mockResolvedValue(saved);
      await start('user');
      if (control === 'create') await create();
      else {
        await wrapper
          .getComponent(ManagementResults)
          .props('actions')
          .openEditor({ id: 7 });
        await flushPromises();
      }

      const form = wrapper.getComponent(ManagementRecordForm);
      expect(
        form.props('editorFields').some((field) => field.key === 'metadata'),
      ).toBe(control === 'edit');
      expect(form.props('editorFields').map((field) => field.key)).toEqual(
        expect.arrayContaining([
          'username',
          ...(control === 'create' ? ['password'] : []),
          'role_id',
          'action_codes',
        ]),
      );
      expect(
        form.props('editorFields').some((field) => field.key === 'password'),
      ).toBe(control === 'create');
      const payload = {
        username: 'operator',
        ...(control === 'create' ? { password: 'initial-password' } : {}),
        role_id: 4,
        action_bindings: [
          {
            resource_key: 'admin:system:role',
            operation: 'read',
            feature_keys: [],
          },
        ],
      };
      Object.assign(form.props('formModel'), payload);
      await save();
      const createKey = expect.any(String);
      const write =
        control === 'create' ? mock.api.createUser : mock.api.updateUser;
      expect(write).toHaveBeenCalledExactlyOnceWith(
        control === 'create' ? createKey : 7,
        payload,
        { suppressErrorMessage: true },
      );
    },
  );

  it('validates both passwords and submits with a reset-only grant', async () => {
    mock.access.controls = ['admin:btn:system:user:reset-password'];
    await start('user');
    const refresh = vi.fn().mockResolvedValue(undefined);
    const dialogs = shallowMount(ManagementUserDialogs, {
      props: {
        permissions: wrapper
          .getComponent(ManagementResults)
          .props('permissions'),
        refresh,
      },
      global: { renderStubDefaultSlot: true },
    });
    try {
      dialogs.vm.openResetPassword({
        id: 7,
        username: 'operator',
        code: 'USER0007',
        status: 2,
      });
      await nextTick();
      const modal = required(
        dialogs.findAllComponents(Modal).find((item) => item.props('open')),
      );
      const [password, confirm] = modal.findAllComponents(InputPassword);
      modal.vm.$emit('ok');
      expect(mock.api.resetUserPassword).not.toHaveBeenCalled();
      required(password).vm.$emit('update:value', 'x');
      required(confirm).vm.$emit('update:value', 'y');
      modal.vm.$emit('ok');
      expect(mock.api.resetUserPassword).not.toHaveBeenCalled();
      required(confirm).vm.$emit('update:value', ' x ');
      modal.vm.$emit('ok');
      modal.vm.$emit('ok');
      await flushPromises();
      expect(mock.api.resetUserPassword).toHaveBeenCalledExactlyOnceWith(
        7,
        'x',
      );
      expect(mock.api.updateUser).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(modal.props('open')).toBe(false);
    } finally {
      dialogs.unmount();
    }
  });

  it('validates nested user metadata and saves a replacement object including deletions', async () => {
    const metadata = {
      ui_preferences: { vben_pc: { app: { layout: 'full' } } },
      obsolete: true,
    };
    const record = { id: 7, username: 'operator', metadata };
    required(mock.api.getSystemRecord).mockResolvedValue(record);
    required(mock.api.updateUser).mockResolvedValue(record);
    await start('user');
    await wrapper
      .getComponent(ManagementResults)
      .props('actions')
      .openEditor({ id: 7 });
    const form = wrapper.getComponent(ManagementRecordForm);
    const model = form.props('formModel');
    expect(model.metadata).toBe(JSON.stringify(metadata, null, 2));
    const validate = required(
      required(required(form.props('formRules').metadata)[0]).validator,
    );
    for (const invalid of ['null', '[]', '42', '"text"']) {
      await expect(validate({}, invalid)).rejects.toThrow(
        'system.validation.metadataObject',
      );
    }
    await expect(validate({}, '{')).rejects.toThrow('system.validation.json');
    await expect(validate({}, '{"rows":[{"badKey":1}]}')).rejects.toThrow(
      'system.validation.metadataKey',
    );
    await expect(validate({}, '{"lock_expired_at":0}')).rejects.toThrow(
      'system.validation.managedMetadata',
    );
    const updated = {
      ui_preferences: { vben_pc: { app: { layout: 'mixed' } } },
    };
    model.metadata = JSON.stringify(updated);
    await validate({}, model.metadata);
    await save();
    expect(mock.api.updateUser).toHaveBeenCalledExactlyOnceWith(
      7,
      { metadata: updated },
      { suppressErrorMessage: true },
    );
  });

  it('skips formatting-only changes and allows clearing user metadata', async () => {
    const record = { id: 7, username: 'operator', metadata: { a: 1, b: true } };
    required(mock.api.getSystemRecord).mockResolvedValue(record);
    required(mock.api.updateUser).mockResolvedValue({
      ...record,
      metadata: {},
    });
    await start('user');
    const { openEditor } = wrapper
      .getComponent(ManagementResults)
      .props('actions');
    await openEditor({ id: 7 });
    wrapper.getComponent(ManagementRecordForm).props('formModel').metadata =
      '{"b":true,"a":1}';
    await save();
    expect(mock.api.updateUser).not.toHaveBeenCalled();
    expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe('detail');

    await openEditor({ id: 7 });
    wrapper.getComponent(ManagementRecordForm).props('formModel').metadata =
      '{}';
    await save();
    expect(mock.api.updateUser).toHaveBeenCalledExactlyOnceWith(
      7,
      { metadata: {} },
      { suppressErrorMessage: true },
    );
  });

  it('uses independent button grants for business group creation, deletion and ordering', async () => {
    const empty = 'admin:empty';
    const used = 'admin:used';
    mock.summary.mockResolvedValue({
      groups: [
        { name: empty, count: 0 },
        { name: used, count: 2 },
      ],
    });
    const createGroup = 'admin:btn:system:action:create-group';
    const deleteGroup = 'admin:btn:system:action:delete-group';
    const reorder = 'admin:btn:system:action:reorder-groups';
    mock.access.controls = [createGroup];
    await start('action');

    const groups = wrapper.getComponent(ActionGroupNav);
    const groupButtons = (key: string) =>
      groups
        .findAllComponents(Button)
        .filter((button) => button.attributes('data-permission-key') === key);
    const groupRow = () => groups.get('.group-select');
    expect(groupButtons(deleteGroup)).toHaveLength(0);
    expect(groupRow().attributes('aria-keyshortcuts')).toBeUndefined();
    required(groupButtons(createGroup)[0]).vm.$emit('click');
    await flushPromises();
    expect(wrapper.getComponent(ActionGroupDialog).props('open')).toBe(true);

    mock.access.controls = [deleteGroup];
    const confirmation = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    await flushPromises();
    expect(groupButtons(createGroup)).toHaveLength(0);
    expect(groupButtons(deleteGroup)).toHaveLength(1);
    required(groupButtons(deleteGroup)[0]).vm.$emit(
      'click',
      new MouseEvent('click'),
    );
    expect(confirmation).toHaveBeenCalledOnce();
    await required(confirmation.mock.calls[0])[0].onOk?.();
    expect(mock.api.updateActionGroup).toHaveBeenCalledExactlyOnceWith({
      operation: 'delete',
      word: empty,
      expected_names: {},
    });
    expect(mock.api.reorderActionGroups).not.toHaveBeenCalled();
    const editGroup = 'admin:btn:system:action:edit-group';
    mock.access.controls = [editGroup];
    await flushPromises();
    expect(groupButtons(deleteGroup)).toHaveLength(0);
    required(groupButtons(editGroup)[0]).vm.$emit(
      'click',
      new MouseEvent('click'),
    );
    await flushPromises();
    expect(wrapper.getComponent(ActionGroupDialog).props('originalWord')).toBe(
      empty,
    );

    mock.access.controls = [reorder];
    await flushPromises();
    expect(groupButtons(createGroup)).toHaveLength(0);
    expect(groupButtons(deleteGroup)).toHaveLength(0);
    expect(groupRow().attributes('aria-keyshortcuts')).toBe(
      'Alt+ArrowUp Alt+ArrowDown',
    );
    await groupRow().trigger('keydown', { key: 'ArrowDown', altKey: true });
    await flushPromises();
    expect(mock.api.reorderActionGroups).toHaveBeenCalledWith(
      [used, empty],
      [],
    );
    expect(mock.api.updateDictionary).not.toHaveBeenCalled();
  });

  it('keeps built-in and wildcard Action records protected despite CRUD button grants', async () => {
    await start('action');
    const { permissions } = wrapper.getComponent(ManagementResults).props();
    for (const config of [
      { builtin: 'default' },
      { builtin: 'all' },
      { permission_scope: '*' },
    ]) {
      const record = { id: 7, config };
      expect(permissions.canManageDefinitionRecord(record)).toBe(false);
      expect(permissions.canRemoveRecord(record)).toBe(false);
      expect(permissions.canSelectRecord(record)).toBe(false);
    }
  });

  it('keeps the permission drawer heading short as more permissions are selected', async () => {
    const word = 'admin:read:assigned:review';
    const bindings = ['read', 'create', 'update', 'delete'].map(
      (operation) => ({
        resource_key: 'admin:system:user',
        operation,
        feature_keys: [],
      }),
    );
    const config = { bindings: bindings.slice(0, 1), ui: [], endpoints: [] };
    required(mock.api.getAction).mockResolvedValue({
      id: 7,
      word,
      name: 'Read users',
      group: 'admin:system:user',
      scope: 'admin',
      config,
    });
    await start('action');
    await wrapper
      .getComponent(ManagementResults)
      .props('actions')
      .openEditor({ id: 7 });
    await flushPromises();

    const drawer = wrapper.getComponent(ManagementDrawer);
    expect(drawer.props('title')).toBe('Edit permission');
    expect(drawer.get('[data-testid="action-editing-word"]').text()).toBe(word);
    wrapper.getComponent(ManagementRecordForm).props('formModel').config = {
      ...config,
      bindings,
    };
    await flushPromises();
    expect(drawer.props('title')).toBe('Edit permission');
    expect(drawer.get('[data-testid="action-editing-word"]').text()).toBe(word);
  });

  it('hydrates an editable record before saving only changed fields', async () => {
    required(mock.api.getSystemRecord).mockResolvedValue({
      id: 7,
      name: 'Full record',
      word: 'reader',
      action_codes: ['A'],
    });
    required(mock.api.updateRole).mockResolvedValue({
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
    const model = wrapper
      .getComponent(ManagementRecordForm)
      .props('formModel') as Record<string, unknown>;
    expect(model.name).toBe('Full record');
    model.name = 'Renamed';
    await save();
    expect(mock.api.updateRole).toHaveBeenCalledExactlyOnceWith(
      7,
      {
        name: 'Renamed',
      },
      { suppressErrorMessage: true },
    );
    expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe('detail');
  });

  it.each([
    { failure: 'network failure', status: undefined, keepKey: true },
    { failure: 'request timeout', status: 408, keepKey: true },
    { failure: 'duplicate request', status: 409, keepKey: true },
    { failure: 'gateway failure', status: 502, keepKey: true },
    { failure: 'invalid input', status: 400, keepKey: false },
  ])(
    'handles a role creation retry after $failure',
    async ({ failure, status, keepKey }) => {
      const error = new Error(failure);
      if (status !== undefined) Object.assign(error, { response: { status } });
      const retryWord = keepKey ? 'new-role' : 'corrected-role';
      required(mock.api.createRole)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          id: 8,
          name: 'New role',
          word: retryWord,
          action_codes: [],
        });
      await start();
      await create();
      const model = wrapper
        .getComponent(ManagementRecordForm)
        .props('formModel');
      Object.assign(model, { name: 'New role', word: 'new-role' });
      await save();
      expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe(
        'create',
      );
      expect(model).toMatchObject({ name: 'New role', word: 'new-role' });
      model.word = retryWord;
      await save();
      expect(mock.api.createRole).toHaveBeenCalledTimes(2);
      const [first, retry] = required(mock.api.createRole).mock.calls;
      expect(required(first)[0]).toEqual(expect.any(String));
      expect(required(retry)[0]).toEqual(expect.any(String));
      expect(required(retry)[0] === required(first)[0]).toBe(keepKey);
      expect(required(retry)[1]).toMatchObject({
        name: 'New role',
        word: retryWord,
      });
    },
  );

  it('keeps a server-reported duplicate identifier on the editable field until it changes', async () => {
    required(mock.api.createRole).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          error_code: 'ROLE_CONFLICT',
          msg: 'Role identifier already exists',
        },
      },
    });
    await start();
    await create();
    const form = wrapper.getComponent(ManagementRecordForm);
    Object.assign(form.props('formModel'), { name: 'New role', word: 'taken' });
    await save();
    expect(wrapper.getComponent(ManagementDrawer).props('mode')).toBe('create');
    const rules = required(form.props('formRules').word);
    const conflict = required(required(rules.at(-1)).validator);
    await expect(conflict({}, 'taken')).rejects.toThrow(
      'Role identifier already exists',
    );
    form.props('formModel').word = 'available';
    await nextTick();
    expect(
      required(form.props('formRules').word).some(
        (rule) => rule.validator === conflict,
      ),
    ).toBe(false);
  });

  it('rechecks write permission after asynchronous validation', async () => {
    await start();
    await create();
    const model = wrapper.getComponent(ManagementRecordForm).props('formModel');
    Object.assign(model, {
      name: 'New role',
      word: 'new-role',
      action_bindings: [],
    });

    let finishValidation!: () => void;
    mock.validate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishValidation = resolve;
      }),
    );
    await save();
    mock.access.button = false;
    finishValidation();
    await flushPromises();
    expect(mock.api.createRole).not.toHaveBeenCalled();
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

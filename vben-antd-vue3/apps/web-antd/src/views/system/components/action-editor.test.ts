import type { VueWrapper } from '@vue/test-utils';

import type { ActionConfig } from '#/api/system';

import { flushPromises, mount } from '@vue/test-utils';

import { CheckboxGroup, Tree } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getEffectivePermissionPaths,
  getPermissionCatalog,
} from '#/api/system';
import { refreshI18nCatalog } from '#/locales';

import { required } from '../../../../../../scripts/test-utils/required';
import ActionEditor from './action-editor.vue';
import { referenceTreeKey } from './resource-references';
// Group persistence has its own API tests; this suite exercises the permission editor.
vi.mock('./action-group-dialog.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('#/api/system', () => ({
  getEffectivePermissionPaths: vi.fn(),
  getPermissionCatalog: vi.fn(),
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => key,
  catalogLabel: (_kind: string, key: string) => key,
  refreshI18nCatalog: vi.fn(),
}));
vi.mock('#/locales/catalog', () => ({
  catalogDefaultLocale: () => 'en-US',
  catalogMessages: () => ({}),
  catalogGroupOrder: () => [],
  catalogGroupWords: () => [],
  catalogLanguages: () => [{ enabled: true, name: 'English', tag: 'en-US' }],
}));
vi.mock('@vben/locales', () => ({
  $placeholder: (key: string) => key,
  $te: () => false,
  i18n: { global: { locale: { value: 'en-US' } } },
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
const data = {
  scopes: ['admin', 'h5', 'mini', 'app'],
  operations: ['read', 'create', 'update', 'delete'],
  resource_catalog: {
    resources: {
      'admin:system': { kind: 'directory' as const, sort: 10 },
      'admin:system:user': {
        kind: 'resource' as const,
        parent: 'admin:system',
        sort: 10,
        entries: {
          'admin:menu:system:user': {
            path: '/system/user',
          },
        },
        operations: {
          read: {
            entry_keys: ['admin:menu:system:user'],
            button_keys: [
              'admin:system:user:query',
              'admin:system:user:detail',
            ],
          },
          create: { entry_keys: [], button_keys: [] },
          update: { entry_keys: [], button_keys: ['admin:system:user:edit'] },
          delete: { entry_keys: [], button_keys: [] },
        },
      },
      'admin:shortcuts': {
        kind: 'directory' as const,
        sort: 20,
        references: ['admin:system:user'],
        reference_operations: { 'admin:system:user': ['read'] },
      },
    },
    buttons: {
      'admin:system:user:query': {
        btn: ['admin:btn:system:user:query'],
        http: [{ method: 'GET', path: '/user' }],
        grpc: [],
      },
      'admin:system:user:detail': {
        btn: ['admin:btn:system:user:view-detail'],
        http: [{ method: 'GET', path: '/user/{id}' }],
        grpc: ['/auth.v1.User/GetUser'],
      },
      'admin:system:user:edit': {
        btn: ['admin:btn:system:user:edit'],
        http: [{ method: 'PATCH', path: '/user/{id}' }],
        grpc: [],
      },
    },
  },
};
let wrapper: VueWrapper<InstanceType<typeof ActionEditor>>;

function mountEditor() {
  wrapper = mount(ActionEditor, {
    props: {
      'onUpdate:config': (config: ActionConfig) => wrapper.setProps({ config }),
      'onUpdate:group': (group: string) => wrapper.setProps({ group }),
      'onUpdate:word': (word: string) => wrapper.setProps({ word }),
    },
  });
}

async function selectResource(key: string) {
  wrapper.getComponent(Tree).vm.$emit('select', [key], { node: { key } });
  await flushPromises();
}

function currentConfig(): ActionConfig {
  const config = wrapper.props('config');
  expect(config).toBeDefined();
  return required(config);
}

async function selectOperation(operation: string, checked: boolean) {
  const row = wrapper
    .findAll('.operation-row')
    .find((item) => item.get('th').text() === operation);
  expect(row, `Missing operation row: ${operation}`).toBeDefined();
  await required(row).get('th input[type="checkbox"]').setValue(checked);
  await flushPromises();
}

async function selectReadFeatures(features: string[]) {
  wrapper
    .get('.operation-row')
    .getComponent(CheckboxGroup)
    .vm.$emit('change', features);
  await flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPermissionCatalog).mockResolvedValue(data);
  vi.mocked(refreshI18nCatalog).mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper?.unmount();
  vi.clearAllMocks();
});
describe('permission resource editor', () => {
  it('clears scoped bindings and preserves manual words across every empty scope', async () => {
    mountEditor();
    await flushPromises();
    const word = () =>
      wrapper.get<HTMLInputElement>('[data-testid="action-word-input"]');
    const selectScope = async (scope: string) => {
      const button = wrapper
        .findAll('[data-testid="action-scope"] button')
        .find((option) => option.get('small').text() === scope);
      expect(button, scope).toBeDefined();
      await required(button).trigger('click');
      await flushPromises();
    };
    for (const scope of ['h5', 'mini', 'app']) {
      await wrapper.setProps({ group: 'admin:system:user' });
      await selectResource('admin:system:user');
      expect(word().element.value, scope).toBe('admin:read:system:user');
      await selectScope(scope);
      expect(word().element.value, scope).toBe('');
      expect(wrapper.props('group'), scope).toBe('');
      expect(currentConfig(), scope).toEqual({
        bindings: [],
        ui: [],
        endpoints: [],
      });
      expect(wrapper.text(), scope).toContain('action-editor.noResources');
      await selectScope('admin');
    }
    const manual = 'admin:read:e2e:manual';
    await word().setValue(manual);
    for (const scope of ['h5', 'mini', 'app']) {
      await wrapper.setProps({ group: 'admin:system:user' });
      await selectResource('admin:system:user');
      await selectScope(scope);
      expect(word().element.value, scope).toBe(manual);
      expect(wrapper.props('group'), scope).toBe('');
      expect(currentConfig(), scope).toEqual({
        bindings: [],
        ui: [],
        endpoints: [],
      });
      expect(wrapper.emitted('validity')?.at(-1)).toEqual([
        'action-editor.wordScopeMismatch',
      ]);
      await selectScope('admin');
      expect(wrapper.emitted('validity')?.at(-1)).toEqual(['']);
    }
  });
  it('opens without an invalid configuration alert and clears selection when scope changes', async () => {
    mountEditor();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(refreshI18nCatalog).not.toHaveBeenCalled();
    await selectResource('admin:system:user');
    expect(wrapper.emitted('update:word')?.at(-1)).toEqual([
      'admin:read:system:user',
    ]);
    await required(
      wrapper.findAll('[data-testid="action-scope"] button')[1],
    ).trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:word')?.at(-1)).toEqual(['']);
    expect(currentConfig()).toEqual({ bindings: [], ui: [], endpoints: [] });
    expect(wrapper.find('.selected-resource').exists()).toBe(false);
    expect(wrapper.text()).toContain('action-editor.noResources');
  });
  it('combines operation selections while keeping page entry and technical paths explicit', async () => {
    mountEditor();
    await flushPromises();
    await selectResource('admin:system:user');
    for (const operation of ['create', 'update', 'delete']) {
      await selectOperation(operation, false);
    }
    await selectReadFeatures(['admin:system:user:query']);
    expect(currentConfig().endpoints).toEqual([
      { protocol: 'http', method: 'GET', path: '/user' },
    ]);
    expect(currentConfig().ui[0]).toMatchObject({
      menu_key: 'admin:menu:system:user',
      menu_path: '/system/user',
      page_entry: true,
      button_keys: ['admin:btn:system:user:query'],
    });

    await selectOperation('update', true);
    expect(currentConfig().bindings).toEqual([
      {
        resource_key: 'admin:system:user',
        operation: 'read',
        feature_keys: ['admin:system:user:query'],
      },
      {
        resource_key: 'admin:system:user',
        operation: 'update',
        feature_keys: ['admin:system:user:edit'],
      },
    ]);
    expect(currentConfig().endpoints).toEqual([
      { protocol: 'http', method: 'GET', path: '/user' },
      { protocol: 'http', method: 'PATCH', path: '/user/{id}' },
    ]);
    expect(currentConfig().ui[0]?.page_entry).toBe(true);

    await selectOperation('read', false);
    expect(currentConfig().endpoints).toEqual([
      { protocol: 'http', method: 'PATCH', path: '/user/{id}' },
    ]);
    expect(currentConfig().ui[0]).toMatchObject({
      page_entry: false,
      button_keys: ['admin:btn:system:user:edit'],
    });
    expect(wrapper.text()).toContain('action-editor.requiresRead');
    await wrapper
      .get('[data-testid="action-technical-toggle"]')
      .trigger('click');
    expect(wrapper.text()).toContain('PATCH /user/{id}');
    expect(wrapper.text()).not.toContain('GET /user');
    expect(getEffectivePermissionPaths).not.toHaveBeenCalled();
  });
  it('selects all available operations and reflects changes from the right pane in the resource tree', async () => {
    mountEditor();
    await flushPromises();
    const key = 'admin:system:user';
    const marker = () =>
      wrapper
        .get(`[data-permission-resource-key="${key}"]`)
        .find('.selection-marker');
    const selectedKeys = () => wrapper.getComponent(Tree).props('selectedKeys');
    expect(marker().exists()).toBe(false);

    await selectResource(key);
    expect(currentConfig().bindings).toEqual([
      {
        resource_key: key,
        operation: 'read',
        feature_keys: [`${key}:query`, `${key}:detail`],
      },
      { resource_key: key, operation: 'create', feature_keys: [] },
      { resource_key: key, operation: 'update', feature_keys: [`${key}:edit`] },
      { resource_key: key, operation: 'delete', feature_keys: [] },
    ]);
    expect(selectedKeys()).toContain(key);
    expect(selectedKeys()).toContain('admin:system');

    await selectReadFeatures([`${key}:query`]);
    expect(marker().attributes('aria-label')).toBe(
      'action-editor.partialSelection',
    );
    expect(selectedKeys()).not.toContain('admin:system');
    await selectReadFeatures([`${key}:query`, `${key}:detail`]);
    expect(selectedKeys()).toContain(key);

    await selectOperation('delete', false);
    expect(marker().attributes('aria-label')).toBe(
      'action-editor.partialSelection',
    );
    await selectOperation('delete', true);
    expect(selectedKeys()).toContain(key);

    await wrapper.get('.select-all input[type="checkbox"]').setValue(false);
    await flushPromises();
    expect(marker().exists()).toBe(false);
    expect(wrapper.find('.selected-resource').exists()).toBe(true);
    await selectResource(key);
    expect(selectedKeys()).toContain(key);

    await selectResource(key);
    expect(marker().exists()).toBe(false);
    expect(currentConfig().bindings).toEqual([]);
  });
  it('keeps a wildcard control separate from the default CRUD selection', async () => {
    const key = 'admin:system:user';
    vi.mocked(getPermissionCatalog).mockResolvedValue({
      ...data,
      resource_catalog: {
        ...data.resource_catalog,
        resources: {
          ...data.resource_catalog.resources,
          [key]: {
            ...data.resource_catalog.resources[key],
            permission_scope: '*',
          },
        },
      },
    });
    mountEditor();
    await flushPromises();
    await selectResource(key);
    expect(currentConfig().bindings?.map(({ operation }) => operation)).toEqual(
      ['read', 'create', 'update', 'delete'],
    );
    expect(currentConfig().permission_scope).toBeUndefined();
    expect(wrapper.getComponent(Tree).props('selectedKeys')).toContain(key);
  });
  it('completes only the operations allowed by a menu reference', async () => {
    mountEditor();
    await flushPromises();
    const key = 'admin:system:user';
    const reference = referenceTreeKey('admin:shortcuts', key);
    const selectedKeys = () => wrapper.getComponent(Tree).props('selectedKeys');
    await selectResource(reference);
    expect(currentConfig().bindings?.map(({ operation }) => operation)).toEqual(
      ['read'],
    );
    expect(selectedKeys()).toContain(reference);
    expect(selectedKeys()).not.toContain(key);

    await selectReadFeatures([`${key}:query`]);
    expect(selectedKeys()).not.toContain(reference);
    await selectResource(reference);
    expect(currentConfig().bindings).toEqual([
      {
        resource_key: key,
        operation: 'read',
        feature_keys: [`${key}:query`, `${key}:detail`],
      },
    ]);
    expect(selectedKeys()).toContain(reference);
    expect(selectedKeys()).not.toContain(key);
  });
  it('blocks submission when permissions fail to load and retries without refreshing i18n', async () => {
    vi.mocked(getPermissionCatalog).mockRejectedValueOnce(new Error('offline'));
    mountEditor();
    await flushPromises();
    expect(wrapper.get('.load-warning button').isVisible()).toBe(true);
    expect(wrapper.emitted('validity')?.at(-1)).toEqual([
      'action-editor.catalogError',
    ]);
    await wrapper.get('.load-warning button').trigger('click');
    await flushPromises();
    expect(getPermissionCatalog).toHaveBeenCalledTimes(2);
    expect(refreshI18nCatalog).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findComponent(Tree).exists()).toBe(true);
    expect(wrapper.emitted('validity')?.at(-1)).not.toEqual([
      'action-editor.catalogError',
    ]);
  });
});

it('shows the inline group creator only with the group creation control', async () => {
  mountEditor();
  await flushPromises();
  const trigger =
    '[data-permission-key="admin:btn:system:action:create-group"]';
  expect(required(wrapper).element.querySelector(trigger) !== null).toBe(false);
  await required(wrapper).setProps({ canCreateGroup: true });
  expect(required(wrapper).element.querySelector(trigger) !== null).toBe(true);
  await required(wrapper).setProps({ canCreateGroup: false });
  expect(required(wrapper).element.querySelector(trigger) !== null).toBe(false);
});

import type { ActionConfig } from '#/api/system';

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import { CheckboxGroup, Tree } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getEffectivePermissionPaths,
  getPermissionCatalog,
} from '#/api/system';
import { refreshI18nCatalog } from '#/locales';

import ActionEditor from './action-editor.vue';
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
          update: { entry_keys: [], button_keys: ['admin:system:user:edit'] },
        },
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
  return config!;
}

async function selectOperation(operation: string, checked: boolean) {
  const row = wrapper
    .findAll('.operation-row')
    .find((item) => item.get('th').text() === operation);
  expect(row, `Missing operation row: ${operation}`).toBeDefined();
  await row!.get('th input[type="checkbox"]').setValue(checked);
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
  it('opens without an invalid configuration alert and clears selection when scope changes', async () => {
    mountEditor();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(refreshI18nCatalog).toHaveBeenCalledOnce();
    await selectResource('admin:system:user');
    expect(wrapper.emitted('update:word')?.at(-1)).toEqual([
      'admin:read:system:user',
    ]);
    await wrapper
      .findAll('[data-testid="action-scope"] button')[1]!
      .trigger('click');
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
    wrapper
      .findAll('.operation-row')[0]!
      .getComponent(CheckboxGroup)
      .vm.$emit('change', ['admin:system:user:query']);
    await flushPromises();
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
  it.each(['permissions', 'translations'])(
    'blocks submission when %s fail to load and recovers after retry',
    async (source) => {
      const request =
        source === 'permissions'
          ? vi.mocked(getPermissionCatalog)
          : vi.mocked(refreshI18nCatalog);
      request.mockRejectedValueOnce(new Error('offline'));
      mountEditor();
      await flushPromises();
      expect(wrapper.text()).toContain('action-editor.catalogError');
      expect(wrapper.emitted('validity')?.at(-1)).toEqual([
        'action-editor.catalogError',
      ]);
      await wrapper.get('.ant-alert button').trigger('click');
      await flushPromises();
      expect(getPermissionCatalog).toHaveBeenCalledTimes(2);
      expect(refreshI18nCatalog).toHaveBeenCalledTimes(2);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.findComponent(Tree).exists()).toBe(true);
      expect(wrapper.emitted('validity')?.at(-1)).not.toEqual([
        'action-editor.catalogError',
      ]);
    },
  );
});

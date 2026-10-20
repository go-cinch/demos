import type { ActionConfig } from '#/api/system';

import { flushPromises, mount } from '@vue/test-utils';

import { Tree } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPermissionCatalog, listActions } from '#/api/system';

import ActionResourceSelector from './action-resource-selector.vue';
import PermissionDetail from './permission-detail.vue';
import PermissionResourceEditor from './permission-resource-editor.vue';

vi.mock('#/api/system', () => ({
  getPermissionCatalog: vi.fn(),
  listActions: vi.fn(),
}));
vi.mock('#/locales', () => ({
  $t: (key: string) => key,
  refreshI18nCatalog: vi.fn(),
}));
vi.mock('@vben/locales', () => ({ $te: () => false }));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
const catalog = {
  scopes: ['admin', 'h5'],
  operations: ['read', 'update'],
  resource_catalog: {
    resources: {
      'admin:system': { kind: 'directory', sort: 1 },
      'admin:system:user': {
        kind: 'resource',
        parent: 'admin:system',
        sort: 1,
        entries: { 'admin:menu:system:user': { path: '/system/user' } },
        operations: {
          read: {
            entry_keys: ['admin:menu:system:user'],
            button_keys: ['query', 'detail'],
          },
          update: { entry_keys: [], button_keys: ['edit'] },
        },
      },
    },
    buttons: {
      query: {
        btn: ['admin:btn:system:user:query'],
        http: [{ method: 'GET', path: '/user' }],
        grpc: [],
      },
      detail: {
        btn: [],
        http: [{ method: 'GET', path: '/user/{id}' }],
        grpc: [],
      },
      edit: {
        btn: ['admin:btn:system:user:edit'],
        http: [{ method: 'PATCH', path: '/user/{id}' }],
        grpc: [],
      },
    },
  },
};
const config: ActionConfig = {
  bindings: [
    {
      resource_key: 'admin:system:user',
      operation: 'read',
      feature_keys: ['query'],
    },
    {
      resource_key: 'admin:system:user',
      operation: 'update',
      feature_keys: [],
    },
  ],
  ui: [],
  endpoints: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPermissionCatalog).mockResolvedValue(catalog as never);
});
describe('read-only permission details', () => {
  it('reuses the editor without allowing changes or exposing transport paths', async () => {
    const wrapper = mount(PermissionDetail, {
      props: {
        actions: [{ code: 'A', word: 'admin:read:custom:name', config }],
      },
    });
    try {
      await flushPromises();
      expect(listActions).not.toHaveBeenCalled();
      const selector = wrapper.getComponent(ActionResourceSelector);
      expect(selector.props('readOnly')).toBe(true);
      const boxes = selector.findAll('input[type="checkbox"]');
      expect(boxes.length).toBeGreaterThan(0);
      expect(
        boxes.every((box) => (box.element as HTMLInputElement).disabled),
      ).toBe(true);
      expect(selector.find('.remove-resource').exists()).toBe(false);
      expect(
        selector
          .get('input[data-testid="action-resource-search"]')
          .attributes('disabled'),
      ).toBeUndefined();
      selector
        .getComponent(Tree)
        .vm.$emit('select', [], { node: { key: 'admin:system:user' } });
      await flushPromises();
      expect(selector.emitted('update:config')).toBeUndefined();
      const editor = wrapper.getComponent(PermissionResourceEditor);
      expect(
        editor
          .props('config')
          ?.bindings?.find((binding) => binding.operation === 'update')
          ?.feature_keys,
      ).toEqual([]);
      expect(wrapper.text()).not.toContain('GET');
      expect(wrapper.text()).not.toContain('/user');
      await wrapper
        .findAll('[data-testid="action-scope"] button')[1]!
        .trigger('click');
      expect(
        wrapper.getComponent(PermissionResourceEditor).props('scope'),
      ).toBe('h5');
    } finally {
      wrapper.unmount();
    }
  });
  it('hydrates missing definitions once, merges duplicates, and keeps unresolved references explicit', async () => {
    vi.mocked(listActions).mockResolvedValue({
      p: 1,
      s: 100,
      t: 2,
      items: [
        { code: 'A', word: 'admin:read:custom:a', config },
        { code: 'B', word: 'admin:read:custom:b', config },
      ],
    } as never);
    const wrapper = mount(PermissionDetail, {
      props: { codes: ['A', 'B', 'gone'] },
    });
    try {
      await flushPromises();
      expect(listActions).toHaveBeenCalledExactlyOnceWith({
        code: 'A,B,gone,',
        f: 'code,word,config',
        p: 1,
        s: 100,
      });
      expect(wrapper.text()).toContain('permission-display.unresolved');
      expect(
        wrapper.getComponent(PermissionResourceEditor).props('config')
          ?.bindings,
      ).toHaveLength(2);
    } finally {
      wrapper.unmount();
    }
  });
  it('shows a retryable failure instead of reporting no permissions', async () => {
    vi.mocked(getPermissionCatalog).mockRejectedValue(new Error('unavailable'));
    const wrapper = mount(PermissionDetail, { props: { codes: ['A'] } });
    try {
      await flushPromises();
      expect(wrapper.text()).toContain('permission-display.loadError');
      expect(wrapper.text()).not.toContain('system-cards.noPermissions');
    } finally {
      wrapper.unmount();
    }
  });
  it('does not fetch catalogs or definitions for an empty assignment', async () => {
    const wrapper = mount(PermissionDetail);
    try {
      await flushPromises();
      expect(getPermissionCatalog).not.toHaveBeenCalled();
      expect(listActions).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('system-cards.noPermissions');
    } finally {
      wrapper.unmount();
    }
  });

  it('does not restore obsolete definitions when a newer selection has loaded', async () => {
    let finish!: (value: never) => void;
    vi.mocked(listActions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(PermissionDetail, { props: { codes: ['old'] } });
    try {
      await flushPromises();
      await wrapper.setProps({
        codes: [],
        actions: [{ code: 'new', word: 'admin:read:system:user', config }],
      });
      await flushPromises();
      finish({ items: [], p: 1, s: 100, t: 0 } as never);
      await flushPromises();
      expect(wrapper.text()).not.toContain('permission-display.unresolved');
      expect(
        wrapper.getComponent(PermissionResourceEditor).props('config')
          ?.bindings,
      ).toHaveLength(2);
      expect(wrapper.attributes('aria-busy')).toBe('false');
    } finally {
      wrapper.unmount();
    }
  });
});

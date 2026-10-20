/* oxlint-disable typescript/no-non-null-assertion -- Fixtures explicitly populate these records. */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clone } from './catalog-model';
import type { Catalog } from './catalog-model';
import { DraftStorage } from './draft-storage';
import { useCatalogDraft } from './use-catalog-draft';

const mock = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn(),
  user: {} as { userInfo: { userId: string } },
  allowed: {} as { value: boolean },
  canPublish: {} as { value: boolean },
}));
vi.mock('@vben/stores', () => ({ useUserStore: () => mock.user }));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({
    canReadDeveloper: mock.allowed,
    canManageDeveloper: mock.canPublish,
  }),
}));
vi.mock('#/api/system', () => ({
  listDictionaries: mock.load,
  updateDictionary: mock.update,
}));

function catalog(): Catalog {
  return {
    schema_version: 2,
    default_locale: 'en-US',
    scopes: ['admin'],
    operations: ['read', 'create', 'update', 'delete'],
    locales: [
      { tag: 'en-US', name: 'English', enabled: true },
      { tag: 'zh-CN', name: '中文', enabled: true },
    ],
    messages: {
      'en-US': { frontend: { label: 'User' } },
      'zh-CN': { frontend: { label: '用户' } },
    },
    resource_catalog: { resources: {}, buttons: {} },
  };
}
const record = (value = catalog()) => ({
  id: 3,
  key: 'I18N_CATALOG',
  enabled: true,
  updated_at: 1,
  value,
});
describe('developer draft workflow', () => {
  let result: ReturnType<typeof useCatalogDraft>;
  let wrapper: ReturnType<typeof mount>;
  async function start() {
    wrapper = mount(
      defineComponent({
        setup() {
          result = useCatalogDraft();
          return () => h('div');
        },
      }),
    );
    await flushPromises();
    return result!;
  }
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    mock.user = reactive({ userInfo: { userId: '1' } });
    mock.allowed = ref(true);
    mock.canPublish = ref(true);
    mock.load.mockResolvedValue({ items: [record()] });
    mock.update.mockImplementation(async (_id, body) => record(body.value));
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });
  it('seeds editable resources once and preserves local changes after reload', async () => {
    const online = catalog();
    online.resource_catalog.resources['admin:default'] = {
      kind: 'directory',
      sort: 0,
      frontend_visible: false,
    };
    mock.load.mockResolvedValue({ items: [record(online)] });
    const a = await start();
    const key = 'admin:high-risk:permission-admin';
    expect(
      Object.keys(
        a.state.draft!.document.resource_catalog.resources[key]?.operations ??
          {},
      ),
    ).toEqual(['read', 'create', 'update', 'delete']);
    expect(a.state.draft!.ui.resourcePreviewVersion).toBe(5);
    a.state.draft!.document.resource_catalog.resources[key]!.entries = {
      'admin:menu:high-risk:permission-admin': { path: '/custom-access' },
    };
    delete a.state.draft!.document.resource_catalog.resources[
      'admin:high-risk:all'
    ];
    wrapper.unmount();
    const b = await start();
    expect(
      b.state.draft!.document.resource_catalog.resources[key]?.entries?.[
        'admin:menu:high-risk:permission-admin'
      ]?.path,
    ).toBe('/custom-access');
    expect(
      b.state.draft!.document.resource_catalog.resources['admin:high-risk:all'],
    ).toBeUndefined();
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('upgrades old read placeholders without discarding configured resource data', async () => {
    const online = catalog();
    online.resource_catalog.resources['admin:default'] = {
      kind: 'directory',
      sort: 0,
      frontend_visible: false,
    };
    mock.load.mockResolvedValue({ items: [record(online)] });
    const a = await start();
    const resources = a.state.draft!.document.resource_catalog.resources;
    resources['admin:high-risk:all']!.operations = {
      read: { entry_keys: [], button_keys: [] },
    };
    resources['admin:high-risk:permission-admin']!.operations = {
      read: {
        entry_keys: [],
        button_keys: ['admin:high-risk:permission-admin:manage'],
      },
    };
    a.state.draft!.ui.resourcePreviewVersion = 1;
    wrapper.unmount();
    const b = await start();
    expect(
      b.state.draft!.document.resource_catalog.resources['admin:high-risk:all']
        ?.operations,
    ).toBeUndefined();
    expect(
      b.state.draft!.document.resource_catalog.resources[
        'admin:high-risk:permission-admin'
      ]?.operations?.read?.button_keys,
    ).toEqual(['admin:high-risk:permission-admin:manage']);
    expect(b.state.draft!.ui.resourcePreviewVersion).toBe(5);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('saves the last input synchronously and restores it after remount', async () => {
    const a = await start();
    a.state.draft!.document.messages['en-US']!.frontend = { label: '' };
    a.state.draft!.ui.query = 'unsent search';
    wrapper.unmount();
    const b = await start();
    expect(b.state.restored).toBe(true);
    expect(b.state.draft!.document.messages['en-US']!.frontend).toEqual({
      label: '',
    });
    expect(b.state.draft!.ui.query).toBe('unsent search');
  });
  it('adopts a newer online baseline when the restored draft has no unpublished edits', async () => {
    const a = await start();
    a.state.draft!.ui.messageQuery = 'saved view state';
    wrapper.unmount();
    const online = catalog();
    online.messages['en-US']!.frontend = { label: 'Updated baseline' };
    mock.load.mockResolvedValue({ items: [record(online)] });
    const b = await start();
    expect(b.state.draft!.document).toEqual(online);
    expect(b.state.draft!.base).toEqual(online);
    expect(b.pending.value).toHaveLength(0);
    expect(b.state.draft!.ui.messageQuery).toBe('saved view state');
  });
  it('persists unfinished group edits synchronously and blocks publication until they are finished', async () => {
    const a = await start();
    a.state.draft!.ui.group = 'admin:system:user';
    a.state.draft!.ui.groupEditor = {
      original: 'admin:system:user',
      word: 'admin:unfinished:',
      names: { 'en-US': '', 'zh-CN': '未完成' },
      attempted: true,
    };
    a.state.draft!.document.messages['en-US']!.frontend = {
      label: 'Other local change',
    };
    wrapper.unmount();
    const b = await start();
    expect(b.state.draft!.ui.group).toBe('admin:system:user');
    expect(b.state.draft!.ui.groupEditor).toEqual({
      original: 'admin:system:user',
      word: 'admin:unfinished:',
      names: { 'en-US': '', 'zh-CN': '未完成' },
      attempted: true,
      isDefault: false,
    });
    expect(await b.publish()).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('fetches authoritative online fields and never overwrites local edits on refresh', async () => {
    const a = await start();
    a.state.draft!.document.messages['en-US']!.frontend = { label: 'Local' };
    const online = catalog();
    online.messages['en-US']!.frontend = { label: 'Online' };
    mock.load.mockResolvedValue({ items: [record(online)] });
    await a.refresh();
    expect(a.state.draft!.document.messages['en-US']!.frontend).toEqual({
      label: 'Local',
    });
    expect(a.conflicts.value).toHaveLength(1);
    expect(mock.load).toHaveBeenCalledWith(
      expect.objectContaining({ f: 'id,key,value,enabled,updated_at' }),
    );
  });
  it('merges unrelated online changes and submits an atomic version condition', async () => {
    const a = await start();
    a.state.draft!.document.messages['en-US']!.frontend = { label: 'Local' };
    const online = catalog();
    online.messages['zh-CN']!.frontend = { label: '线上' };
    mock.load.mockResolvedValue({ items: [record(online)] });
    expect(await a.publish()).toBe(true);
    expect(mock.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        expected_value: online,
        value: expect.objectContaining({
          messages: {
            'en-US': { frontend: { label: 'Local' } },
            'zh-CN': { frontend: { label: '线上' } },
          },
        }),
      }),
    );
    expect(a.pending.value).toHaveLength(0);
  });
  it('blocks unresolved conflicts and preserves the draft after submission failure', async () => {
    const a = await start();
    a.state.draft!.document.messages['en-US']!.frontend = { label: 'Local' };
    const online = catalog();
    online.messages['en-US']!.frontend = { label: 'Online' };
    mock.load.mockResolvedValue({ items: [record(online)] });
    expect(await a.publish()).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
    a.rebase(clone(a.state.draft!.document));
    mock.update.mockRejectedValue(new Error('network'));
    expect(await a.publish()).toBe(false);
    expect(a.state.error).toBe('submitFailed');
    expect(a.state.draft!.document.messages['en-US']!.frontend).toEqual({
      label: 'Local',
    });
  });
  it('does not report a failed local write as saved and refuses publication', async () => {
    const a = await start();
    vi.spyOn(DraftStorage.prototype, 'save').mockImplementation(() => {
      throw new Error('quota');
    });
    a.state.draft!.document.messages['en-US']!.frontend = { label: 'Local' };
    expect(a.state.storageError).toBe(true);
    expect(await a.publish()).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('makes no catalog request without page access and isolates a new account', async () => {
    mock.allowed.value = false;
    const a = await start();
    expect(mock.load).not.toHaveBeenCalled();
    expect(a.state.draft).toBeNull();
    mock.allowed.value = true;
    await flushPromises();
    a.state.draft!.document.messages['en-US']!.frontend = {
      label: 'Account one',
    };
    mock.user.userInfo.userId = '2';
    await flushPromises();
    expect(a.state.draft!.document.messages['en-US']!.frontend).toEqual({
      label: 'User',
    });
  });
  it('allows catalog reading without publication authority and blocks writes', async () => {
    mock.canPublish.value = false;
    const a = await start();
    expect(mock.load).toHaveBeenCalled();
    expect(a.state.draft).not.toBeNull();
    a.state.draft!.document.messages['en-US']!.frontend = {
      label: 'Unpublished',
    };
    expect(await a.publish()).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rechecks publication authority after a draft was opened', async () => {
    const a = await start();
    a.state.draft!.document.messages['en-US']!.frontend = {
      label: 'Unpublished',
    };
    mock.canPublish.value = false;
    expect(await a.publish()).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
    expect(a.state.draft!.document.messages['en-US']!.frontend).toEqual({
      label: 'Unpublished',
    });
  });
});

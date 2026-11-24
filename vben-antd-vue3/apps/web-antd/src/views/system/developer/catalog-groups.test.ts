import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { computed, reactive } from 'vue';

import { afterEach, expect, it, vi } from 'vitest';

import { authRequestClient } from '#/api/request';
import { publishDictionaryCatalog } from '#/api/system';

import { fixture } from './__fixtures__/catalog';
import { catalogEditorKey } from './catalog-editor-context';
import CatalogGroups from './catalog-groups.vue';
import { initialUI } from './catalog-model';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { props: ['icon'], template: '<span :data-icon="icon" />' },
}));
vi.mock('@vben/locales', () => ({
  $placeholder: (key: string) => key,
  i18n: { global: { locale: { value: 'en-US' } } },
}));
vi.mock('#/api/request', () => ({ authRequestClient: { get: vi.fn() } }));
vi.mock('#/api/system', () => ({
  listDictionaries: vi.fn(),
  publishDictionaryCatalog: vi.fn(),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/locales/catalog', () => ({
  catalogDefaultLocale: () => 'en-US',
  catalogGroupNames: () => ({}),
  catalogGroupWords: () => [],
  catalogLanguages: () => [],
}));

enableAutoUnmount(afterEach);

it('creates and reorders permission groups in the developer draft', async () => {
  const existing = 'admin:system:user';
  const added = 'admin:system:billing';
  const catalog = fixture();
  catalog.group_order = [existing];
  vi.mocked(authRequestClient.get).mockResolvedValue({
    groups: [{ name: existing, count: 2 }],
  });
  const ui = reactive(initialUI());
  const wrapper = mount(CatalogGroups, {
    global: {
      provide: {
        [catalogEditorKey]: {
          ui: computed(() => ui),
          catalog: computed(() => catalog),
        },
      },
    },
    props: {
      active: true,
      base: catalog,
      catalog,
      disabled: false,
      renames: {},
    },
  });
  await flushPromises();

  await wrapper.get('.system-group-add').trigger('click');
  const form = wrapper.get('[data-testid="permission-group-form"]');
  await form.get('input[id$="-word"]').setValue(added);
  await form.get('input[id$="-name-en-US"]').setValue('Billing');
  await form.get('.form-actions button.ant-btn-primary').trigger('click');
  const created = wrapper.emitted<[typeof catalog]>('update:catalog')?.[0]?.[0];
  expect(created?.group_order).toEqual([existing, added]);
  await wrapper.setProps({ catalog: created });

  const [first, second] = wrapper.findAll(
    '[data-testid="permission-group-row"]',
  );
  expect(first?.attributes('draggable')).toBe('true');
  expect(first?.find('[data-icon="lucide:grip-vertical"]').exists()).toBe(true);
  const dataTransfer = new DataTransfer();
  await first?.trigger('dragstart', { dataTransfer });
  await second?.trigger('dragover', { clientY: 1, dataTransfer });
  expect(second?.classes()).toContain('drop-after');
  await second?.trigger('drop', { dataTransfer });
  const reordered =
    wrapper.emitted<[typeof catalog]>('update:catalog')?.[1]?.[0];
  expect(reordered?.group_order).toEqual([added, existing]);
  expect(publishDictionaryCatalog).not.toHaveBeenCalled();
});

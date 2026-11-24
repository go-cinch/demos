import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { expect, it, vi } from 'vitest';

import MailTemplates from './index.vue';

const list = vi.hoisted(() => vi.fn());
vi.mock('#/api/mail-template', () => ({
  createMailTemplate: vi.fn(),
  deleteMailTemplate: vi.fn(),
  listMailTemplates: list,
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<main><slot /></main>' },
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('@vben/stores', () => ({
  registerTabCloseGuard: () => () => {},
  useTimezoneStore: () => ({ timezone: 'Asia/Shanghai' }),
}));
vi.mock('@vben/utils', () => ({ formatDateTime: String }));
vi.mock('#/locales', () => ({ $t: (key: string) => key.split('.').at(-1) }));
vi.mock('#/composables/use-default-page-size', () => ({
  useDefaultPageSize: () => ({ value: 10 }),
}));
vi.mock('#/composables/use-operation-confirmation', () => ({
  useOperationConfirmation: () => ({ confirmSensitiveOperation: vi.fn() }),
}));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasPage: () => true, hasButton: () => true }),
}));
vi.mock('#/components/search-autocomplete.vue', () => ({
  default: {
    props: ['value'],
    emits: ['update:value'],
    template:
      '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
}));
vi.mock('#/components/skeleton-table.vue', () => ({
  default: {
    props: ['dataSource'],
    template:
      '<template v-for="record in dataSource" :key="record.id"><slot name="bodyCell" :column="{ key: \'operation\' }" :record="record" /></template>',
  },
}));
vi.mock('./editor.vue', () => ({
  default: {
    props: [
      'id',
      'nextId',
      'previousId',
      'navigationLoading',
      'navigationError',
    ],
    emits: ['navigate', 'retry-navigation', 'close'],
    template: `<section>
      <output>{{ id }}</output>
      <button :disabled="!previousId || navigationLoading" @click="$emit('navigate', previousId)">previous</button>
      <button :disabled="!nextId || navigationLoading" @click="$emit('navigate', nextId)">next</button>
      <button v-if="navigationError" @click="$emit('retry-navigation')">retryNavigation</button>
      <button @click="$emit('close')">allTemplates</button>
    </section>`,
    methods: { confirmLeave: () => true },
  },
}));

const items = (first: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: first + index,
    template_id: `notice.${first + index}`,
    name: `Notice ${first + index}`,
  }));
const page = (
  p: number,
  s: number,
  t: number,
  records: ReturnType<typeof items>,
) => ({ p, s, t, items: records });

const Select = defineComponent({
  emits: ['update:value', 'change'],
  setup(_props, { emit }) {
    return () =>
      h(
        'select',
        {
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;
            emit('update:value', value);
            emit('change', value);
          },
        },
        [
          h('option', ''),
          h('option', { value: 'notification' }, 'notification'),
        ],
      );
  },
});

it('loads every navigation batch and retries a failed second batch without exposing partial IDs', async () => {
  list.mockReset();
  let rejectSecond = true;
  let override: ((p: number) => unknown) | undefined;
  list.mockImplementation(async ({ p, s }) => {
    if (s !== 100) return page(p, s, 101, items(100, 1));
    if (override) return override(p);
    if (p === 1) return page(1, 100, 101, items(1, 100));
    if (rejectSecond) throw new Error('second page unavailable');
    return page(2, 100, 101, items(101, 1));
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/system/mail-template', component: MailTemplates }],
  });
  await router.push('/system/mail-template');
  const wrapper = mount(MailTemplates, {
    global: { plugins: [router], stubs: { ASelect: Select } },
  });
  const button = (label: string) => {
    const item = wrapper
      .findAll('button')
      .find((candidate) => candidate.text() === label);
    if (!item) throw new Error(`Missing button ${label}`);
    return item;
  };
  const navigate = async (label: string) => {
    await button(label).trigger('click');
    await flushPromises();
  };
  const current = () => Number(wrapper.get('output').text());
  const disabled = (label: string) =>
    (button(label).element as HTMLButtonElement).disabled;
  const batches = () =>
    list.mock.calls.map(([query]) => query).filter(({ s }) => s === 100);
  try {
    await flushPromises();
    await wrapper.get('input').setValue('notice');
    await wrapper.get('select').setValue('notification');
    await flushPromises();
    await navigate('edit');
    expect(current()).toBe(100);
    expect(disabled('previous')).toBe(true);
    expect(disabled('next')).toBe(true);
    expect(batches()).toEqual(
      [1, 2].map((p) => ({ p, s: 100, q: 'notice', category: 'notification' })),
    );

    rejectSecond = false;
    await navigate('retryNavigation');
    expect(current()).toBe(100);
    await navigate('next');
    expect(current()).toBe(101);
    expect(disabled('next')).toBe(true);
    await navigate('previous');
    const ordered = [current(), 101];
    while (!disabled('previous')) {
      await navigate('previous');
      ordered.unshift(current());
    }
    expect(ordered).toEqual(items(1, 101).map(({ id }) => id));
    expect(batches().map(({ p }) => p)).toEqual([1, 2, 1, 2]);

    await navigate('allTemplates');
    override = (p) => page(p, 100, 201, p === 1 ? items(1, 100) : []);
    await router.replace({ query: { template: 999 } });
    await flushPromises();
    expect(current()).toBe(999);
    expect(disabled('previous')).toBe(true);
    await navigate('next');
    expect(current()).toBe(1);
    expect(
      batches()
        .slice(-2)
        .map(({ p }) => p),
    ).toEqual([1, 2]);

    await navigate('allTemplates');
    let releaseOld: (value: ReturnType<typeof page>) => void = () => {};
    const old = new Promise<ReturnType<typeof page>>((resolve) => {
      releaseOld = resolve;
    });
    override = () => old;
    await router.replace({ query: { template: 100 } });
    await flushPromises();
    override = (p) => page(p, 100, 2, items(200, 2));
    await router.replace({ query: { template: 200 } });
    await flushPromises();
    releaseOld(page(1, 100, 1, items(100, 1)));
    await flushPromises();
    expect(current()).toBe(200);
    await navigate('next');
    expect(current()).toBe(201);
    expect(disabled('next')).toBe(true);
  } finally {
    wrapper.unmount();
  }
});

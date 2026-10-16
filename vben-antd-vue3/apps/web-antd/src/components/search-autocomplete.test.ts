import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { h } from 'vue';

import { AutoComplete, Form, FormItem, Input } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SearchAutocomplete from './search-autocomplete.vue';

vi.mock('#/locales', () => ({ $t: (key: string, params?: Record<string, unknown>) => `${key}:${params?.value ?? ''}` }));
vi.mock('@vben/icons', () => ({ IconifyIcon: { template: '<span />' } }));
const options = [
  { label: 'Backend results', options: [{ value: 'alpha', label: 'alpha', source: 'backend' }] },
  { label: 'History', options: [{ value: 'saved', label: 'saved', source: 'history' }] },
];
let wrapper: VueWrapper<InstanceType<typeof SearchAutocomplete>>;
function setup(extra: Parameters<typeof mount<typeof SearchAutocomplete>>[1] = {}) {
  wrapper = mount(SearchAutocomplete, {
    attachTo: document.body,
    ...extra,
    props: {
      options,
      value: 'al',
      'onUpdate:value': (value: string) => { void wrapper.setProps({ value }); },
      ...extra.props,
    },
  });
  return wrapper;
}
async function focus() {
  wrapper.vm.focus();
  await flushPromises();
}
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('shared search autocomplete', () => {
  it('renders grouped results and removes history without selecting or submitting it', async () => {
    setup(); await focus();
    expect(document.body.textContent).toContain('Backend results');
    expect(document.body.textContent).toContain('History');
    expect(document.body.textContent).not.toContain('undefined');
    expect(document.querySelector('.search-match')?.textContent).toBe('al');
    const remove = new DOMWrapper(document.querySelector<HTMLButtonElement>('[data-testid="search-history-option"] button')!);
    await remove.trigger('mousedown');
    await remove.trigger('click');
    expect(wrapper.emitted('remove-history')).toEqual([['saved']]);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('input').element.value).toBe('al');
  });

  it('closes suggestions on Escape while preserving the query and stopping parent dismissal', async () => {
    const parentKey = vi.fn();
    document.body.addEventListener('keydown', parentKey);
    try {
      setup(); await focus();
      const input = wrapper.get('input');
      expect(input.attributes('aria-expanded')).toBe('true');
      await input.trigger('keydown', { key: 'Escape', keyCode: 27 });
      expect(input.attributes('aria-expanded')).toBe('false');
      expect(input.element.value).toBe('al');
      expect(wrapper.emitted('search')).toBeUndefined();
      expect(parentKey).not.toHaveBeenCalled();
      await wrapper.setProps({ options: [{ value: 'late-result' }] });
      expect(input.attributes('aria-expanded')).toBe('false');
    } finally { document.body.removeEventListener('keydown', parentKey); }
  });

  it('submits typed text once on Enter and ignores composition Enter', async () => {
    setup(); await focus();
    const input = wrapper.get('input');
    await input.setValue('typed');
    vi.useFakeTimers();
    await input.trigger('keydown', { key: 'Enter', keyCode: 13, isComposing: true });
    expect(wrapper.emitted('submit')).toBeUndefined();
    await input.trigger('keydown', { key: 'Enter', keyCode: 13, which: 13 });
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.emitted('submit')).toEqual([['typed']]);
    expect(input.attributes('aria-expanded')).toBe('false');
  });

  it('selects the highlighted option on Enter without also submitting', async () => {
    setup(); await focus();
    const input = wrapper.get('input');
    vi.useFakeTimers();
    await input.trigger('keydown', { key: 'ArrowDown', keyCode: 40, which: 40 });
    await input.trigger('keydown', { key: 'Enter', keyCode: 13, which: 13 });
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.emitted('select')).toEqual([['alpha']]);
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(input.element.value).toBe('alpha');
    expect(input.attributes('aria-expanded')).toBe('false');
  });

  it('shows a loading skeleton with no options and closes when disabled', async () => {
    setup({ props: { options: [], loading: true } }); await focus();
    expect(document.querySelector('.skeleton-options[aria-busy="true"]')).not.toBeNull();
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    expect(wrapper.getComponent(AutoComplete).props('open')).toBe(false);
  });

  it('allows rich backend rows while keeping history removal shared', async () => {
    setup({
      props: { options: [{ value: 'alpha', field: 'username' }, ...options.slice(1)] },
      slots: { result: ({ option }) => h('strong', { 'data-testid': 'field-result' }, `${option.field}: ${option.value}`) },
    });
    await focus();
    expect(document.querySelector('[data-testid="field-result"]')?.textContent).toBe('username: alpha');
    expect(document.querySelector('[data-testid="search-history-option"] button')).not.toBeNull();
  });

  it('labels the native combobox when Ant keeps aria attributes on its wrapper', async () => {
    setup({ attrs: { 'aria-label': 'Search members' } });
    expect(wrapper.get('label').text()).toBe('Search members');
    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('input').attributes('id'));
  });

  it('preserves the form item generated input ID and label association', () => {
    const form = mount(Form, {
      props: { name: 'filters', model: { username: '' } },
      slots: { default: () => h(FormItem, { name: 'username', label: 'Username' }, { default: () => h(SearchAutocomplete) }) },
    });
    try {
      expect(form.get('label').attributes('for')).toBe('filters_username');
      expect(form.get('input').attributes('id')).toBe('filters_username');
    } finally { form.unmount(); }
  });

  it('forwards field identity and sizing with an accessible, focusable custom input', async () => {
    setup({
      attrs: { id: 'search-example', class: 'page-width', style: 'width: 240px', 'data-testid': 'example-search' },
      slots: { input: () => h(Input, { placeholder: 'Find a member', allowClear: true, 'aria-label': 'Search example' }) },
    });
    expect(wrapper.classes()).toContain('page-width');
    expect(wrapper.attributes('style')).toContain('width: 240px');
    const input = wrapper.get('input');
    expect(wrapper.get('[data-testid="example-search"]').classes()).toContain('ant-select');
    expect(input.attributes('id')).toBe('search-example');
    expect(input.attributes('aria-label')).toBe('Search example');
    expect(input.attributes('placeholder')).toBe('Find a member');
    await focus();
    expect(document.activeElement).toBe(input.element);
    wrapper.vm.blur();
    await vi.waitFor(() => expect(wrapper.emitted('blur')).toHaveLength(1));
  });
});

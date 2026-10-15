import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, withDirectives } from 'vue';

import { describe, expect, it } from 'vitest';

import { vSkeleton } from './skeleton';

const Region = defineComponent({
  props: { loading: Boolean, child: Boolean },
  setup(props) {
    return () => withDirectives(h('section', [
      h('input', { value: 'draft' }),
      props.child ? h('p', 'Async content') : null,
    ]), [[vSkeleton, props.loading]]);
  },
});

describe('skeleton layout lifecycle', () => {
  it('preserves the same input and draft through repeated loads and restores interaction', async () => {
    const wrapper = mount(Region);
    const input = wrapper.get('input').element;
    for (let iteration = 0; iteration < 2; iteration++) {
      await wrapper.setProps({ loading: true });
      expect(wrapper.element.inert).toBe(true);
      expect(wrapper.get('input').element).toBe(input);
      expect(input.value).toBe('draft');
      await wrapper.setProps({ loading: false });
      expect(wrapper.element.inert).toBe(false);
      expect(wrapper.find('.layout-skeleton-shape').exists()).toBe(false);
      expect(wrapper.get('input').element).toBe(input);
    }
    wrapper.unmount();
  });

  it('covers content mounted while a request is still pending', async () => {
    const wrapper = mount(Region, { props: { loading: true } });
    await wrapper.setProps({ child: true });
    await nextTick();
    expect(wrapper.get('p').classes()).toContain('layout-skeleton-shape');
    await wrapper.setProps({ loading: false });
    expect(wrapper.get('p').text()).toBe('Async content');
    expect(wrapper.get('p').classes()).not.toContain('layout-skeleton-shape');
    wrapper.unmount();
  });

  it('keeps a region originally inert after loading ends', async () => {
    const wrapper = mount(Region, { attrs: { inert: true } });
    await wrapper.setProps({ loading: true });
    await wrapper.setProps({ loading: false });
    expect(wrapper.element.inert).toBe(true);
    wrapper.unmount();
  });
});

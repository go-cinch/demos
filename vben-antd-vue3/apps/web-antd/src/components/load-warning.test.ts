import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStatisticsWarning } from '#/composables/use-statistics-warning';

import LoadWarning from './load-warning.vue';

vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const StatisticsHarness = defineComponent({
  props: { error: Boolean },
  setup(props) {
    const visible = useStatisticsWarning(() => props.error);
    return () => h('section', [
      visible.value ? h(LoadWarning, { kind: 'statistics' }) : null,
      h('output', String(props.error)),
    ]);
  },
});
const wrappers: Array<ReturnType<typeof mount>> = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  vi.useRealTimers();
});

function statistics() {
  const wrapper = mount(StatisticsHarness, { props: { error: true } });
  wrappers.push(wrapper);
  return wrapper;
}

describe('shared loading warnings', () => {
  it('hides the statistics warning after five seconds without clearing the failed state', async () => {
    const wrapper = statistics();
    expect(wrapper.get('.ant-alert-warning').text()).toBe('app.errors.statisticsLoad');
    await vi.advanceTimersByTimeAsync(4999);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('output').text()).toBe('true');
  });

  it('cancels the old timeout on retry and gives a new failure a full five seconds', async () => {
    const wrapper = statistics();
    await vi.advanceTimersByTimeAsync(4000);
    await wrapper.setProps({ error: false });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await wrapper.setProps({ error: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('cleans up the dismissal timer when the page unmounts', async () => {
    const wrapper = statistics();
    wrapper.unmount();
    wrappers.length = 0;
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps data warnings and their retry action visible after five seconds', async () => {
    const retry = vi.fn();
    const wrapper = mount(LoadWarning, {
      slots: { action: () => h('button', { onClick: retry }, 'Retry') },
    });
    wrappers.push(wrapper);
    await vi.advanceTimersByTimeAsync(6000);
    expect(wrapper.get('.ant-alert-warning').text()).toContain('app.errors.dataLoad');
    expect(wrapper.classes()).toContain('load-warning--data');
    await wrapper.get('button').trigger('click');
    expect(retry).toHaveBeenCalledOnce();
  });
});

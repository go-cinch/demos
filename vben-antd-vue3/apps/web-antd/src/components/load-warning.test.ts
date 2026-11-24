import type { LoadFailure } from '#/api/request-error';

import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadFailure } from '#/api/request-error';
import { useStatisticsWarning } from '#/composables/use-statistics-warning';

import LoadWarning from './load-warning.vue';

vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const StatisticsHarness = defineComponent({
  props: {
    error: {
      type: [Boolean, String] as unknown as import('vue').PropType<LoadFailure>,
      default: false,
    },
  },
  setup(props) {
    const visible = useStatisticsWarning(() => props.error);
    return () =>
      h('section', [
        visible.value ? h(LoadWarning, { kind: 'statistics' }) : null,
        h('output', String(props.error)),
      ]);
  },
});
const wrappers: Array<ReturnType<typeof mount>> = [];
beforeEach(() => {
  vi.useFakeTimers();
});
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
  it.each([500, 502, 503, 504])(
    'keeps the retry action for status %s without repeating the toast',
    async (status) => {
      const wrapper = mount(LoadWarning, {
        props: { failure: loadFailure({ response: { status } }) },
        slots: { action: '<button>Retry</button>' },
      });
      wrappers.push(wrapper);
      expect(wrapper.get('button').text()).toBe('Retry');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      await wrapper.setProps({ failure: false });
      expect(wrapper.find('button').exists()).toBe(false);
    },
  );

  it('marks a gateway failure locally for background statistics', async () => {
    const wrapper = mount(StatisticsHarness, { props: { error: 'gateway' } });
    wrappers.push(wrapper);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'app.errors.statisticsLoad',
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('output').text()).toBe('gateway');
  });

  it('hides the statistics warning after five seconds without clearing the failed state', async () => {
    const wrapper = statistics();
    expect(wrapper.get('.ant-alert-warning').text()).toBe(
      'app.errors.statisticsLoad',
    );
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
    expect(wrapper.get('[role="status"] button').isVisible()).toBe(true);
    expect(wrapper.classes()).toContain('load-warning--data');
    await wrapper.get('button').trigger('click');
    expect(retry).toHaveBeenCalledOnce();
  });
});

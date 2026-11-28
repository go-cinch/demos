import { mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';

import { playLoginTransition } from '../store/login-transition';
import AuthJourney from './auth-journey.vue';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('keeps the illustration static and lets login finish immediately at 0 ms', async () => {
  const frame = vi.spyOn(window, 'requestAnimationFrame');
  const wrapper = mount(AuthJourney, { props: { dark: false, durationMs: 0 } });
  try {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    await playLoginTransition();
    expect(timeout).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
    expect(wrapper.find('[data-part="vehicle"]').exists()).toBe(true);
  } finally {
    wrapper.unmount();
  }
});

it.each([500, 2000])(
  'scales the approach and pause to a %i ms budget',
  async (durationMs) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const wrapper = mount(AuthJourney, { props: { dark: false, durationMs } });
    try {
      vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 600, 360),
      );
      for (const image of wrapper.findAll('image')) await image.trigger('load');
      const done = vi.fn();
      const waiting = playLoginTransition().then(done);
      const tick = frame.mock.lastCall![0];
      await vi.advanceTimersByTimeAsync(durationMs * 0.4);
      tick(performance.now());
      await wrapper.vm.$nextTick();
      expect(wrapper.attributes('data-phase')).toBe('arriving');
      await vi.advanceTimersByTimeAsync(durationMs * 0.4);
      tick(performance.now());
      await wrapper.vm.$nextTick();
      expect(wrapper.attributes('data-phase')).toBe('arrived');
      await vi.advanceTimersByTimeAsync(durationMs * 0.1 - 1);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toHaveBeenCalledOnce();
      await waiting;
    } finally {
      wrapper.unmount();
    }
  },
);

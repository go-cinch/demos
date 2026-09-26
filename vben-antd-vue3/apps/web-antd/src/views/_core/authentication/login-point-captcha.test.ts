import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPointCaptcha from './login-point-captcha.vue';

const PopoverStub = defineComponent({
  name: 'Popover',
  template: '<div><slot name="content" /><slot /></div>',
});

const captcha = {
  captcha_id: 'captcha-id',
  captcha_image: 'data:image/png;base64,AA==',
  expired_at: Date.now() + 60_000,
  height: 180,
  hint_text: '甲 · 乙',
  target_count: 2,
  width: 300,
};

function mountCaptcha(onVerify: ReturnType<typeof vi.fn>) {
  return mount(LoginPointCaptcha, {
    global: {
      stubs: {
        APopover: PopoverStub,
      },
    },
    props: {
      captcha,
      onRefresh: vi.fn().mockResolvedValue(undefined),
      onVerify: onVerify as (
        points: Array<{ x: number; y: number }>,
      ) => Promise<{ verified: boolean }>,
    },
  });
}

describe('login-point-captcha', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 180,
      height: 180,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('accepts points only after the backend verifies their order', async () => {
    const onVerify = vi.fn().mockResolvedValue({ verified: true });
    const wrapper = mountCaptcha(onVerify);
    const points = [
      { i: 0, t: 1, x: 40, y: 50 },
      { i: 1, t: 2, x: 180, y: 120 },
    ];

    const image = wrapper.find('img');
    await image.trigger('click', {
      clientX: points[0]!.x,
      clientY: points[0]!.y,
    });
    await image.trigger('click', {
      clientX: points[1]!.x,
      clientY: points[1]!.y,
    });
    await flushPromises();

    expect(onVerify).toHaveBeenCalledWith([
      { x: 40, y: 50 },
      { x: 180, y: 120 },
    ]);
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      { x: 40, y: 50 },
      { x: 180, y: 120 },
    ]);
    expect(wrapper.find('.captcha-panel-error').exists()).toBe(false);
  });

  it('shakes with a red frame and clears it after three seconds on failure', async () => {
    const onVerify = vi.fn().mockResolvedValue({
      captcha: { ...captcha, captcha_id: 'refreshed-id' },
      verified: false,
    });
    const wrapper = mountCaptcha(onVerify);

    const image = wrapper.find('img');
    await image.trigger('click', { clientX: 180, clientY: 120 });
    await image.trigger('click', { clientX: 40, clientY: 50 });
    await flushPromises();

    expect(wrapper.find('.captcha-panel-error').exists()).toBe(true);
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([]);

    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(wrapper.find('.captcha-panel-error').exists()).toBe(false);
  });
});

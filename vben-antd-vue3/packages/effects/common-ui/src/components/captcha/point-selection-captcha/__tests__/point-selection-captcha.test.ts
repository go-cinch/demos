import { mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PointSelectionCaptcha from '../index.vue';

describe('point-selection-captcha', () => {
  beforeEach(() => {
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
  });

  it('removes a selected point when the same position is clicked again', async () => {
    const wrapper = mount(PointSelectionCaptcha, {
      props: {
        captchaImage: 'data:image/png;base64,AA==',
        height: 180,
        hintText: '甲 · 乙',
        width: 300,
      },
    });
    const image = wrapper.find('img');

    await image.trigger('click', { clientX: 80, clientY: 60 });

    expect(wrapper.findAll('[role="button"][tabindex="0"]')).toHaveLength(1);
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual([
      expect.objectContaining({ i: 0, x: 80, y: 60 }),
    ]);

    await image.trigger('click', { clientX: 84, clientY: 64 });

    expect(wrapper.findAll('[role="button"][tabindex="0"]')).toHaveLength(0);
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual([]);
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('removes a point when its numbered marker is clicked', async () => {
    const wrapper = mount(PointSelectionCaptcha, {
      props: {
        captchaImage: 'data:image/png;base64,AA==',
        height: 180,
        hintText: '甲 · 乙',
        width: 300,
      },
    });

    await wrapper.find('img').trigger('click', { clientX: 80, clientY: 60 });
    const marker = wrapper.find('[role="button"][tabindex="0"]');
    await marker.trigger('click');

    expect(wrapper.findAll('[role="button"][tabindex="0"]')).toHaveLength(0);
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual([]);
  });
});

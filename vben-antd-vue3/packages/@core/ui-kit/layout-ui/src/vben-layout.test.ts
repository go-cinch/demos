import type { VbenLayoutProps } from './vben-layout';

import { createApp, h, nextTick, reactive } from 'vue';

import { expect, it } from 'vitest';

import { required } from '../../../../../scripts/test-utils/required';
import VbenLayout from './vben-layout.vue';

it('renders static, fixed, hover-reveal and scroll-reveal headers', async () => {
  const props = reactive<Pick<VbenLayoutProps, 'headerMode' | 'headerVisible'>>(
    {
      headerMode: 'static',
      headerVisible: true,
    },
  );
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(
        VbenLayout,
        {
          ...props,
          headerToggleSidebarButton: false,
          sidebarEnable: false,
          tabbarEnable: false,
        },
        {
          header: () =>
            h('span', { 'data-test-header-content': '' }, 'Header content'),
          content: () => h('div', { style: { height: '1600px' } }),
        },
      ),
  });
  app.mount(host);
  const region = (key: string) => {
    const element = host.querySelector<HTMLElement>(
      `[data-layout-region="${key}"]`,
    );
    expect(element, key).not.toBeNull();
    return required(element);
  };
  const move = async (y: number) => {
    region('main').dispatchEvent(new MouseEvent('mousemove', { clientY: y }));
    await nextTick();
  };
  const scroll = async (top: number) => {
    const element = region('scroll');
    element.scrollTop = top;
    element.dispatchEvent(new Event('scroll'));
    await nextTick();
  };
  const mode = async (value: VbenLayoutProps['headerMode']) => {
    props.headerMode = value;
    await nextTick();
  };
  const hiddenByTransform = () =>
    region('header').style.transform.includes('-100%');
  try {
    await nextTick();
    Object.defineProperties(region('scroll'), {
      clientHeight: { value: 500 },
      scrollHeight: { value: 1600 },
    });
    expect(region('scroll').contains(region('header'))).toBe(true);
    expect(region('header').style.position).toBe('static');
    await scroll(350);
    expect(hiddenByTransform()).toBe(false);

    await mode('fixed');
    expect(region('scroll').contains(region('header'))).toBe(false);
    expect(region('header').style.position).toBe('fixed');
    await scroll(420);
    expect(hiddenByTransform()).toBe(false);

    await mode('auto');
    await scroll(480);
    await move(180);
    expect(hiddenByTransform()).toBe(true);
    await move(2);
    expect(hiddenByTransform()).toBe(false);

    await mode('auto-scroll');
    await scroll(600);
    expect(hiddenByTransform()).toBe(true);
    await scroll(550);
    expect(hiddenByTransform()).toBe(false);

    props.headerVisible = false;
    await nextTick();
    expect(host.querySelector('[data-test-header-content]')).toBeNull();
  } finally {
    app.unmount();
    host.remove();
  }
});

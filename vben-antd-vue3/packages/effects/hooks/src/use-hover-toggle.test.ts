import { effectScope, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHoverToggle } from './use-hover-toggle';

describe('useHoverToggle controller', () => {
  let scope: ReturnType<typeof effectScope> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    scope?.stop();
    document.body.replaceChildren();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function setupHover(delay?: Parameters<typeof useHoverToggle>[1]) {
    const element = document.createElement('button');
    document.body.append(element);
    scope = effectScope();
    const [value, controller] = scope.run(() =>
      useHoverToggle(element, delay),
    )!;
    await nextTick();
    return { controller, element, value };
  }

  async function hover(
    element: HTMLElement,
    type: 'mouseenter' | 'mouseleave',
  ) {
    element.dispatchEvent(new MouseEvent(type));
    await nextTick();
  }

  it('keeps a manually opened value after disabling the initial leave delay', async () => {
    const { controller, value } = await setupHover();
    controller.disable();
    value.value = true;

    await vi.advanceTimersByTimeAsync(500);

    expect(value.value).toBe(true);
  });

  it('cancels a pending enter when hover control is disabled', async () => {
    const { controller, element, value } = await setupHover({
      enterDelay: 100,
    });
    await hover(element, 'mouseenter');
    expect(value.value).toBe(false);

    controller.disable();
    await vi.advanceTimersByTimeAsync(500);

    expect(value.value).toBe(false);
  });

  it('cancels a pending leave when hover control is disabled', async () => {
    const { controller, element, value } = await setupHover();
    await hover(element, 'mouseenter');
    expect(value.value).toBe(true);
    await hover(element, 'mouseleave');

    controller.disable();
    await vi.advanceTimersByTimeAsync(500);

    expect(value.value).toBe(true);
  });

  it('resumes delayed hover changes when enabled again', async () => {
    const { controller, element, value } = await setupHover({
      enterDelay: 100,
      leaveDelay: 300,
    });
    controller.disable();
    await hover(element, 'mouseenter');
    await vi.advanceTimersByTimeAsync(500);
    expect(value.value).toBe(false);

    controller.enable();
    await nextTick();
    await vi.advanceTimersByTimeAsync(99);
    expect(value.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(value.value).toBe(true);

    await hover(element, 'mouseleave');
    await vi.advanceTimersByTimeAsync(299);
    expect(value.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(value.value).toBe(false);
  });
});

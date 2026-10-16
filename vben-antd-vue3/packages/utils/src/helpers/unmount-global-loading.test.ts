import { afterEach, describe, expect, it, vi } from 'vitest';
import { unmountGlobalLoading } from './unmount-global-loading';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
describe('startup loading cleanup', () => {
  it('removes the mask even when transitionend never fires', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<style data-app-loading="inject-css"></style><div id="__app-loading__"></div><main>Ready page</main>';
    unmountGlobalLoading();
    expect(document.querySelector('#__app-loading__')?.classList.contains('hidden')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('#__app-loading__')).toBeNull();
    expect(document.querySelector('[data-app-loading]')).toBeNull();
    expect(document.querySelector('main')?.textContent).toBe('Ready page');
  });
  it('cancels the fallback timer when the transition completes normally', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="__app-loading__"></div>';
    const ready = vi.fn();
    window.addEventListener('vben:app-ready', ready, { once: true });
    unmountGlobalLoading();
    document.querySelector('#__app-loading__')?.dispatchEvent(new Event('transitionend'));
    expect(ready).toHaveBeenCalledOnce();
    expect(document.querySelector('#__app-loading__')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

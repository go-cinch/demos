import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSliderCaptchaChallengeApi, verifySliderCaptchaApi } from '#/api';

import ServerSliderCaptcha from './server-slider-captcha.vue';

vi.mock('#/api', () => ({ createSliderCaptchaChallengeApi: vi.fn(), verifySliderCaptchaApi: vi.fn() }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
const SliderStub = defineComponent({
  emits: ['start', 'move', 'end'],
  methods: { resume() {}, showPassedAtEnd() {}, showPendingAtEnd() {} },
  template: '<div><button name="captcha-action" /></div>',
});
let wrapper: ReturnType<typeof mount>;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(40);
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.mocked(createSliderCaptchaChallengeApi).mockResolvedValue({ captcha_id: 'challenge', expired_at: 10000 });
  vi.mocked(verifySliderCaptchaApi).mockResolvedValue({ proof: 'proof' });
  wrapper = mount(ServerSliderCaptcha, { props: { purpose: 'login', username: 'example' }, global: { stubs: { SliderCaptcha: SliderStub } } });
});
afterEach(() => { wrapper.unmount(); vi.restoreAllMocks(); vi.clearAllMocks(); });
async function drag() {
  const slider = wrapper.findComponent({ ref: 'sliderRef' });
  slider.vm.$emit('start'); await flushPromises();
  slider.vm.$emit('move', { moveX: 254 });
  slider.vm.$emit('end'); await flushPromises();
}
describe('server slider transport failures', () => {
  it('reports a challenge 502 as a gateway failure, never a failed gesture', async () => {
    vi.mocked(createSliderCaptchaChallengeApi).mockRejectedValue({ response: { status: 502 } });
    await drag(); expect(wrapper.get('[role="alert"]').text()).toBe('app.errors.serverLost');
    expect(verifySliderCaptchaApi).not.toHaveBeenCalled();
  });
  it('reports a verification 502 and allows the next drag to succeed', async () => {
    vi.mocked(verifySliderCaptchaApi).mockRejectedValueOnce({ response: { status: 502 } });
    await drag(); expect(wrapper.get('[role="alert"]').text()).toBe('app.errors.serverLost');
    await drag(); expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['proof']);
  });
  it('keeps the original message for a genuinely rejected verification', async () => {
    vi.mocked(verifySliderCaptchaApi).mockRejectedValueOnce({ response: { status: 400 } });
    await drag(); expect(wrapper.get('[role="alert"]').text()).toBe('app.captcha.sliderFailed');
  });
});

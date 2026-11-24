import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../../../scripts/test-utils/required';
import UnbindEmail from './unbind-email.vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  replace: vi.fn(),
  route: { path: '/auth/unbind-email', hash: '' },
}));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('#/api/core/auth', () => ({ confirmEmailUnlinkApi: mocks.confirm }));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));

const render = () =>
  mount(UnbindEmail, {
    global: {
      stubs: {
        Result: {
          props: ['title'],
          template: '<div>{{ title }}<slot name="extra" /></div>',
        },
        Button: { template: '<button><slot /></button>' },
        Spin: true,
      },
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.route.hash = '#token=fixture';
  window.history.replaceState({}, '');
});

describe('email unlink landing', () => {
  it('keeps the result after the auth layout remounts on fragment removal', async () => {
    mocks.confirm.mockResolvedValue({ already_confirmed: false });
    const first = render();
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith('fixture');
    const destination = required(mocks.replace.mock.calls[0])[0];
    expect(destination).toEqual({
      path: mocks.route.path,
      state: { emailUnlinkResult: 'done' },
    });
    first.unmount();
    window.history.replaceState(destination.state, '');
    mocks.route.hash = '';
    const receipt = render();
    await flushPromises();
    expect(receipt.text()).toContain('email-auth.unlinkDone');
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    receipt.unmount();
  });

  it('shows the dedicated expired-link result', async () => {
    mocks.confirm.mockRejectedValue({
      response: {
        status: 409,
        data: { error_code: 'AUTH_UNLINK_INVALID', msg: 'backend detail' },
      },
    });
    const receipt = render();
    await flushPromises();
    expect(receipt.text()).toContain('email-auth.invalidLink');
    expect(receipt.text()).not.toContain('backend detail');
    receipt.unmount();
  });

  it('preserves the link for a transient delivery failure and displays a replay receipt', async () => {
    mocks.confirm
      .mockRejectedValueOnce({
        response: { status: 503, data: { msg: '邮件服务暂不可用' } },
      })
      .mockResolvedValueOnce({ already_confirmed: true });
    const receipt = render();
    await flushPromises();
    expect(receipt.text()).toContain('邮件服务暂不可用');
    expect(mocks.replace).not.toHaveBeenCalled();
    await receipt.get('button').trigger('click');
    await flushPromises();
    expect(mocks.replace).toHaveBeenCalledWith({
      path: mocks.route.path,
      state: { emailUnlinkResult: 'used' },
    });
    receipt.unmount();
  });
});

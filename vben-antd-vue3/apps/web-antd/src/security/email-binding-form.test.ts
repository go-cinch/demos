import { flushPromises, mount } from '@vue/test-utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindEmailApi,
  getBindEmailCodeStatusApi,
  sendBindEmailCodeApi,
} from '#/api/core/auth';

import { required } from '../../../../scripts/test-utils/required';
import EmailBindingForm from './email-binding-form.vue';

vi.mock('#/api/core/auth', () => ({
  bindEmailApi: vi.fn(),
  sendBindEmailCodeApi: vi.fn(),
  getBindEmailCodeStatusApi: vi.fn(),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
const state = {
  server_time: 1000,
  retry_at: 1000,
  expired_at: 301_000,
  verification_id: 'first',
};
function openForm(inline = true) {
  return mount(EmailBindingForm, {
    props: { inline, complete: vi.fn(), currentSession: () => true },
  });
}
beforeEach(() => {
  vi.mocked(getBindEmailCodeStatusApi).mockResolvedValue({
    server_time: 1000,
    retry_at: 0,
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe.each([true, false])('email binding (inline=%s)', (inline) => {
  it('rejects an email without a domain suffix before sending', async () => {
    const page = openForm(inline);
    try {
      const input = page.get('#binding-email');
      await input.setValue('a@b');
      await (inline
        ? input.trigger('blur')
        : page.get('form').trigger('submit'));
      expect(input.attributes('aria-invalid')).toBe('true');
      expect(sendBindEmailCodeApi).not.toHaveBeenCalled();
    } finally {
      page.unmount();
    }
  });

  it('shows the expiry hint for three seconds after an issued code expires', async () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'performance',
      ],
    });
    vi.mocked(sendBindEmailCodeApi).mockResolvedValue({
      ...state,
      expired_at: state.server_time + 1000,
    });
    const page = openForm(inline);
    try {
      await page.get('#binding-email').setValue('first@example.test');
      await (inline
        ? page.get('button[type=button]').trigger('click')
        : page.get('form').trigger('submit'));
      await flushPromises();
      expect(page.find('#binding-code-error').exists()).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      const hint = page.get('#binding-code-error');
      expect(hint.text()).toBe('email-auth.expired');
      expect(hint.classes()).not.toContain('sr-only');
      await vi.advanceTimersByTimeAsync(3000);
      expect(hint.classes()).toContain('sr-only');
    } finally {
      page.unmount();
    }
  });
});

describe('profile email binding', () => {
  it('discards the previous challenge on address change and waits for explicit confirmation', async () => {
    vi.mocked(sendBindEmailCodeApi)
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ ...state, verification_id: 'second' });
    const page = openForm();
    try {
      await page.get('#binding-email').setValue('first@example.test');
      await page.get('button[type=button]').trigger('click');
      await flushPromises();
      await page.get('#binding-code').setValue('123456');
      expect(page.get('#binding-email').attributes('disabled')).toBeUndefined();
      await page.get('#binding-email').setValue('Second@Example.Test');
      expect(page.get('#binding-code').attributes('disabled')).toBeDefined();
      await page.get('button[type=button]').trigger('click');
      await flushPromises();
      expect(
        (page.get('#binding-code').element as HTMLInputElement).value,
      ).toBe('');
      expect(bindEmailApi).not.toHaveBeenCalled();
      await page.get('#binding-code').setValue('234567');
      await page.get('form').trigger('submit');
      await flushPromises();
      expect(bindEmailApi).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'second@example.test',
          verification_id: 'second',
          verification_code: '234567',
        }),
        expect.any(Function),
      );
      expect(sessionStorage.length).toBe(0);
    } finally {
      page.unmount();
    }
  });

  it.each([true, false])(
    'checks the confirmed ticket after a lost response (accepted=%s)',
    async (accepted) => {
      vi.mocked(sendBindEmailCodeApi).mockRejectedValue(new Error('timeout'));
      vi.mocked(getBindEmailCodeStatusApi)
        .mockResolvedValueOnce({ server_time: 1000, retry_at: 0 })
        .mockResolvedValue(
          accepted ? state : { server_time: 1000, retry_at: 61_000 },
        );
      const page = openForm();
      try {
        await page.get('#binding-email').setValue('user@example.test');
        await page.get('button[type=button]').trigger('click');
        await flushPromises();
        expect(sendBindEmailCodeApi).toHaveBeenCalledOnce();
        expect(getBindEmailCodeStatusApi).toHaveBeenCalledWith(
          expect.any(String),
          'user@example.test',
          {
            suppressErrorMessage: true,
          },
        );
        expect(
          page.get('#binding-code').attributes('disabled') === undefined,
        ).toBe(accepted);
        expect(page.text()).not.toContain('email-auth.requestFailed');
        expect(page.get('#binding-email').attributes('aria-invalid')).toBe(
          'false',
        );
        expect(
          document.body.querySelector('.ant-message-info [role="status"]')
            ?.textContent,
        ).toBe(accepted ? undefined : 'ui.fallback.http.requestTimeout');
      } finally {
        page.unmount();
      }
    },
  );

  it('cancels a pending confirmation before the encrypted request is submitted', async () => {
    vi.mocked(sendBindEmailCodeApi).mockResolvedValue(state);
    const page = openForm();
    const complete = page.props('complete');
    let finish!: () => void;
    vi.mocked(bindEmailApi).mockImplementation(async (_data, pending) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      if (!pending?.()) throw new DOMException('Cancelled', 'AbortError');
      throw new Error('A dismissed form must not submit');
    });
    await page.get('#binding-email').setValue('first@example.test');
    await page.get('button[type=button]').trigger('click');
    await flushPromises();
    await page.get('#binding-code').setValue('123456');
    await page.get('form').trigger('submit');
    const pending = required(
      required(vi.mocked(bindEmailApi).mock.calls[0])[1],
    );
    expect(pending()).toBe(true);
    page.unmount();
    expect(pending()).toBe(false);
    finish();
    await flushPromises();
    expect(complete).not.toHaveBeenCalled();
  });
});

it('reads the shared cooldown on entry before an email address is entered', async () => {
  vi.mocked(getBindEmailCodeStatusApi).mockResolvedValue({
    server_time: 1000,
    retry_at: 61_000,
  });
  const page = openForm();
  try {
    await flushPromises();
    expect(getBindEmailCodeStatusApi).toHaveBeenCalledWith(
      expect.any(String),
      '',
      { suppressErrorMessage: true },
    );
    expect(
      page.get('button[type=button]').attributes('disabled'),
    ).toBeDefined();
    expect(page.text()).toContain('email-auth.countdown');
    expect(page.find('[role=alert]').exists()).toBe(false);
  } finally {
    page.unmount();
  }
});

it.each([
  new Error('Network Error'),
  { response: { status: 500 } },
  { response: { status: 502 } },
])(
  'does not turn background status failures into email validation errors: %j',
  async (cause) => {
    vi.useFakeTimers();
    vi.mocked(getBindEmailCodeStatusApi).mockRejectedValue(cause);
    const page = openForm();
    try {
      await flushPromises();
      const address = page.get('#binding-email');
      expect(getBindEmailCodeStatusApi).toHaveBeenCalledWith(
        expect.any(String),
        '',
        { suppressErrorMessage: true },
      );
      expect(page.find('[role=alert]').exists()).toBe(false);
      expect(address.attributes('aria-invalid')).toBe('false');
      await address.setValue('user@example.test');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();
      expect(getBindEmailCodeStatusApi).toHaveBeenLastCalledWith(
        expect.any(String),
        'user@example.test',
        { suppressErrorMessage: true },
      );
      expect(page.find('[role=alert]').exists()).toBe(false);
      expect(address.attributes('aria-invalid')).toBe('false');
      expect(
        page.get('button[type=button]').attributes('disabled'),
      ).toBeUndefined();
      expect(sendBindEmailCodeApi).not.toHaveBeenCalled();
      await address.setValue('invalid-email');
      await address.trigger('blur');
      expect(address.attributes('aria-invalid')).toBe('true');
      expect(page.get('#binding-address-error').text()).toBe(
        'email-auth.emailRequired',
      );
    } finally {
      page.unmount();
    }
  },
);

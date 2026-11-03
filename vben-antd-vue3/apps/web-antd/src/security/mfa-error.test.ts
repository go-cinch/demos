import { i18n } from '@vben/locales';

import { describe, expect, it, vi } from 'vitest';

import { useMFAError } from './mfa-error';

vi.mock('@vben/locales', async () => {
  const { ref } = await import('vue');
  return { i18n: { global: { locale: ref('en-US') } } };
});
vi.mock('#/locales', () => ({ $t: (key: string) => `${i18n.global.locale.value}:${key}` }));

describe('unmapped MFA errors', () => {
  it('preserves useful server feedback, then uses a translated fallback after a language change', () => {
    const error = useMFAError();
    error.setCause({ response: { data: { msg: 'A new server error' } } });
    expect(error.message.value).toBe('A new server error');
    i18n.global.locale.value = 'zh-CN';
    expect(error.message.value).toBe('zh-CN:mfa.failed');
    error.clear();
    expect(error.message.value).toBe('');
  });
});

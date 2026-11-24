import { describe, expect, it, vi } from 'vitest';

import { prepareVerificationRetry } from './verification-retry';

describe('multi-factor authentication request retry', () => {
  it('reissues expired JWE material without changing the operation or idempotency key', async () => {
    const original = {
      method: 'POST',
      url: '/user',
      headers: { 'x-idempotent': 'same-operation' },
      data: JSON.stringify({
        username: 'operator',
        challenge_id: 'expired',
        credential: 'expired-jwe',
        role_id: 2,
      }),
      verificationRetryCredential: vi
        .fn()
        .mockResolvedValue({ challenge_id: 'fresh', credential: 'fresh-jwe' }),
    };
    const retried = await prepareVerificationRetry(original);
    expect(retried.headers).toEqual(original.headers);
    expect(retried.url).toBe('/user');
    expect(retried._verificationRetried).toBe(true);
    expect(retried.data).toEqual({
      username: 'operator',
      role_id: 2,
      challenge_id: 'fresh',
      credential: 'fresh-jwe',
    });
    expect(JSON.parse(original.data).challenge_id).toBe('expired');
    expect(original.verificationRetryCredential).toHaveBeenCalledOnce();
  });
  it('retains ordinary payloads and propagates challenge-generation failure', async () => {
    const body = { value: 'unchanged' };
    const result = await prepareVerificationRetry({ data: body });
    expect(result.data).toBe(body);
    await expect(
      prepareVerificationRetry({
        data: {},
        verificationRetryCredential: async () => {
          throw new Error('challenge unavailable');
        },
      }),
    ).rejects.toThrow('challenge unavailable');
  });
});

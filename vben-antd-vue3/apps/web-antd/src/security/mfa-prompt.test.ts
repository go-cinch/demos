import { afterEach, describe, expect, it } from 'vitest';
import { cancelMFA, completeMFA, MFACancelled, mfaPrompt, requestMFA } from './mfa-prompt';

afterEach(cancelMFA);
describe('MFA dialog coordination', () => {
  it('coalesces simultaneous sensitive requests and clears transient state', async () => {
    const first = requestMFA('sensitive');
    const second = requestMFA('sensitive');
    expect(second).toBe(first);
    completeMFA(mfaPrompt.value!.id);
    await expect(first).resolves.toBeUndefined();
    expect(mfaPrompt.value).toBeUndefined();
  });
  it('cancels pending operations on logout and ignores a late verifier response', async () => {
    const first = requestMFA('sensitive');
    const oldId = mfaPrompt.value!.id;
    const cancelled = expect(first).rejects.toBeInstanceOf(MFACancelled);
    cancelMFA();
    await cancelled;
    const second = requestMFA('sensitive');
    completeMFA(oldId);
    expect(mfaPrompt.value?.id).not.toBe(oldId);
    completeMFA(mfaPrompt.value!.id);
    await second;
  });
  it('does not reuse a login challenge for a sensitive operation', async () => {
    const login = requestMFA('login', 'ticket');
    const cancelled = expect(login).rejects.toBeInstanceOf(MFACancelled);
    const sensitive = requestMFA('sensitive');
    await cancelled;
    expect(mfaPrompt.value?.mode).toBe('sensitive');
    expect(mfaPrompt.value?.ticket).toBeUndefined();
    completeMFA(mfaPrompt.value!.id);
    await sensitive;
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import { rejectionOf } from '../../../../scripts/test-utils/rejection-of';
import { required } from '../../../../scripts/test-utils/required';
import {
  cancelVerification,
  completeVerification,
  requestVerification,
  VerificationCancelled,
  verificationPrompt,
} from './verification-prompt';

afterEach(cancelVerification);
describe('verification dialog coordination', () => {
  it('coalesces simultaneous sensitive requests and clears transient state', async () => {
    const first = requestVerification('sensitive');
    const second = requestVerification('sensitive');
    expect(second).toBe(first);
    completeVerification(required(verificationPrompt.value).id);
    await expect(first).resolves.toBeUndefined();
    expect(verificationPrompt.value).toBeUndefined();
  });
  it('cancels pending operations on logout and ignores a late verifier response', async () => {
    const first = requestVerification('sensitive');
    const oldId = required(verificationPrompt.value).id;
    const cancelled = rejectionOf(first);
    cancelVerification();
    expect(await cancelled).toBeInstanceOf(VerificationCancelled);
    const second = requestVerification('sensitive');
    completeVerification(oldId);
    expect(verificationPrompt.value?.id).not.toBe(oldId);
    completeVerification(required(verificationPrompt.value).id);
    await second;
  });
  it('does not reuse a login challenge for a sensitive operation', async () => {
    const login = requestVerification('login', 'ticket');
    const cancelled = rejectionOf(login);
    const sensitive = requestVerification('sensitive');
    expect(await cancelled).toBeInstanceOf(VerificationCancelled);
    expect(verificationPrompt.value?.mode).toBe('sensitive');
    expect(verificationPrompt.value?.ticket).toBeUndefined();
    completeVerification(required(verificationPrompt.value).id);
    await sensitive;
  });
});

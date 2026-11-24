import type { AuthApi, SensitiveEmailTicket } from '#/api/core/auth';

import { shallowRef } from 'vue';

type VerifyCode = (
  code: string,
  email?: SensitiveEmailTicket,
) => Promise<boolean | undefined> | Promise<void>;

type VerificationMode = 'enroll' | 'login' | 'sensitive' | 'test';
export interface VerificationPrompt {
  id: number;
  mode: VerificationMode;
  methods?: { totp: boolean; address: string };
  ticket?: string;
  expiresAt?: number;
  // false returns a handled request failure to its caller without success UI.
  verify?: VerifyCode;
}
export const verificationPrompt = shallowRef<VerificationPrompt>();
let sequence = 0;
let pending:
  | undefined
  | {
      promise: Promise<AuthApi.LoginResult | undefined>;
      resolve: (value?: AuthApi.LoginResult) => void;
      reject: (reason: Error) => void;
    };

export class VerificationCancelled extends Error {
  constructor() {
    super('Verification cancelled');
  }
}

export function requestVerification(
  mode: VerificationMode,
  ticket?: string,
  expiresAt?: number,
  verify?: VerifyCode,
  methods?: { totp: boolean; address: string },
) {
  if (
    pending &&
    verificationPrompt.value?.mode === mode &&
    verificationPrompt.value?.ticket === ticket
  )
    return pending.promise;
  cancelVerification();
  let resolve!: (value?: AuthApi.LoginResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<AuthApi.LoginResult | undefined>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  pending = { promise, resolve, reject };
  verificationPrompt.value = {
    id: ++sequence,
    mode,
    ticket,
    expiresAt,
    verify,
    methods,
  };
  return promise;
}

export function completeVerification(id: number, result?: AuthApi.LoginResult) {
  if (verificationPrompt.value?.id !== id) return;
  const current = pending;
  pending = undefined;
  verificationPrompt.value = undefined;
  current?.resolve(result);
}

export function cancelVerification() {
  const current = pending;
  pending = undefined;
  verificationPrompt.value = undefined;
  current?.reject(new VerificationCancelled());
}

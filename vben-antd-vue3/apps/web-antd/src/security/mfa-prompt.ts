import type { AuthApi } from '#/api/core/auth';
import { shallowRef } from 'vue';

type MFAMode = 'enroll' | 'login' | 'sensitive' | 'test';
export interface MFAPrompt {
  id: number;
  mode: MFAMode;
  ticket?: string;
  expiresAt?: number;
  // false returns a handled request failure to its caller without success UI.
  verify?: (code: string) => Promise<boolean | void>;
}
export const mfaPrompt = shallowRef<MFAPrompt>();
let sequence = 0;
let pending: { promise: Promise<AuthApi.LoginResult | undefined>; resolve: (value?: AuthApi.LoginResult) => void; reject: (reason: Error) => void } | undefined;

export class MFACancelled extends Error {
  constructor() { super('MFA cancelled'); }
}

export function requestMFA(mode: MFAMode, ticket?: string, expiresAt?: number, verify?: (code: string) => Promise<boolean | void>) {
  if (pending && mfaPrompt.value?.mode === mode && mfaPrompt.value?.ticket === ticket) return pending.promise;
  cancelMFA();
  let resolve!: (value?: AuthApi.LoginResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<AuthApi.LoginResult | undefined>((yes, no) => { resolve = yes; reject = no; });
  pending = { promise, resolve, reject };
  mfaPrompt.value = { id: ++sequence, mode, ticket, expiresAt, verify };
  return promise;
}

export function completeMFA(id: number, result?: AuthApi.LoginResult) {
  if (mfaPrompt.value?.id !== id) return;
  const current = pending;
  pending = undefined;
  mfaPrompt.value = undefined;
  current?.resolve(result);
}

export function cancelMFA() {
  const current = pending;
  pending = undefined;
  mfaPrompt.value = undefined;
  current?.reject(new MFACancelled());
}

import { toRaw } from 'vue';

/** Authentication transport metadata stays separate from business response objects. */
const enrollmentResponses = new WeakSet<object>();
const passwordResetResponses = new WeakSet<object>();

export function responseHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const source = headers as Record<string, unknown> & { get?: (key: string) => unknown };
  const value = typeof source.get === 'function'
    ? source.get(name)
    : Object.entries(source).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return typeof value === 'string' ? value : undefined;
}

export function rememberAuthRequirements(data: unknown, headers: unknown) {
  if (!data || typeof data !== 'object') return;
  const response = toRaw(data);
  if (responseHeader(headers, 'X-MFA-Enrollment-Required') === 'true') {
    enrollmentResponses.add(response);
  }
  if (responseHeader(headers, 'X-Password-Reset-Required') === 'true') {
    passwordResetResponses.add(response);
  }
}

export function isMFAEnrollmentRequired(data: object) {
  return enrollmentResponses.has(toRaw(data));
}

export function isPasswordResetRequired(data: object) {
  return passwordResetResponses.has(toRaw(data));
}

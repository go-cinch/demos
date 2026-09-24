export const USER_PASSWORD_MESSAGE_KEY = 'app.validation.password';
export const USER_USERNAME_MESSAGE_KEY = 'app.validation.username';

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{4,49}$/;

export function isValidUserPassword(value: unknown) {
  if (typeof value !== 'string') return false;
  const length = new TextEncoder().encode(value).length;
  return length >= 6 && length <= 72;
}

export function isValidUsername(value: unknown) {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

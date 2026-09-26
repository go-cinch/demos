export const USER_PASSWORD_MESSAGE_KEY = 'app.validation.password';
export const USER_USERNAME_MESSAGE_KEY = 'app.validation.username';

export function isValidUserPassword(value: unknown) {
  return typeof value === 'string' && value.trim() !== '';
}

export function isValidUsername(value: unknown) {
  return typeof value === 'string' && value.trim() !== '';
}

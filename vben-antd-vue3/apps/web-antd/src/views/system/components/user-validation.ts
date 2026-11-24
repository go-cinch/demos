import { $t } from '#/locales';

export {
  isValidUsername,
  isValidUserPassword,
  USER_PASSWORD_MESSAGE_KEY,
  USER_USERNAME_MESSAGE_KEY,
} from '#/user-validation';

function validateMetadataKeys(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((item) => validateMetadataKeys(item));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key)) {
        throw new Error($t('system.validation.metadataKey', { key }));
      }
      validateMetadataKeys(child);
    }
  }
}

const managedKeys = new Set([
  'lock_expired_at',
  'password_change_failures',
  'password_reset_skipped',
  'reject_register_reason',
]);

export function editableUserMetadata(value?: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([key]) => !managedKeys.has(key)),
  );
}

export function validateUserMetadata(text: unknown) {
  let metadata: unknown;
  try {
    metadata = JSON.parse(String(text));
  } catch {
    throw new Error($t('system.validation.json'));
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error($t('system.validation.metadataObject'));
  }
  validateMetadataKeys(metadata);
  for (const key of Object.keys(metadata)) {
    if (managedKeys.has(key))
      throw new Error($t('system.validation.managedMetadata', { key }));
  }
}

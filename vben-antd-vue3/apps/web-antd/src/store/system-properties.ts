import type { SystemProperties } from '#/api/core/auth';

import { computed, shallowRef } from 'vue';

import { setSupportLanguages } from '@vben/constants';

import { getSystemPropertiesApi } from '#/api/core/auth';

const properties = shallowRef<SystemProperties>();
export const emailEnabled = computed(
  () => properties.value?.email_enabled === true,
);
export const totpEnabled = computed(
  () => properties.value?.totp_enabled === true,
);
let snapshot: Promise<SystemProperties | undefined> | undefined;
let loading = false;

async function refreshProperties() {
  let next: SystemProperties | undefined;
  try {
    const result = await getSystemPropertiesApi();
    if (
      typeof result?.registration_enabled === 'boolean' ||
      typeof result?.email_enabled === 'boolean' ||
      typeof result?.totp_enabled === 'boolean'
    ) {
      const locales = Array.isArray(result.locales)
        ? result.locales.filter(
            (item) =>
              item?.enabled === true &&
              typeof item.tag === 'string' &&
              item.tag &&
              typeof item.name === 'string',
          )
        : [];
      const validLanguages = locales.some(
        (item) => item.tag === result.default_locale,
      );
      if (validLanguages)
        setSupportLanguages(
          locales.map((item) => ({ label: item.name, value: item.tag })),
        );
      next = {
        ...(result.ui_preferences?.vben_pc
          ? { ui_preferences: result.ui_preferences }
          : {}),
        ...(validLanguages
          ? { locales, default_locale: result.default_locale }
          : {}),
        registration_enabled: result.registration_enabled === true,
        email_enabled: result.email_enabled === true,
        totp_enabled: result.totp_enabled === true,
      };
    }
  } catch {
    // Keep password login available when the public settings cannot be loaded.
  }
  properties.value = next;
  return properties.value;
}

// Navigation shares a snapshot; completed login revalidates the deployment flags.
export function loadSystemProperties(options: { fresh?: boolean } = {}) {
  if (!snapshot || (options.fresh && !loading)) {
    loading = true;
    snapshot = refreshProperties().finally(() => {
      loading = false;
    });
  }
  return snapshot;
}

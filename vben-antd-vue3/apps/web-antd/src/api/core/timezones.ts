import type { TimezoneChoice } from '@vben/preferences';

import { authSilentPublicRequestClient } from '#/api/request';
import { showRequestErrorToast } from '#/api/request-feedback';

interface TimezoneRecord {
  value: string;
  name: Record<string, string>;
  region: string;
  sort: number;
  enabled: boolean;
}

export async function getTimezoneOptionsApi(): Promise<TimezoneChoice[]> {
  const result = await authSilentPublicRequestClient
    .get<{
      items: TimezoneRecord[];
    }>('/pub/timezones')
    .catch((error: unknown) => {
      showRequestErrorToast(error);
      throw error;
    });
  return result.items.map((item) => ({
    value: item.value,
    label: item.name['en-US'] || item.value,
    name: item.name,
    region: item.region,
  }));
}

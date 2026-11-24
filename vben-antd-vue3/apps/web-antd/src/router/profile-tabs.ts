import type { TabDefinition } from '@vben/types';

import { normalizePathTabs } from './normalize-path-tabs';

export function normalizeProfileTabs(
  tabs: TabDefinition[],
  currentPath: string,
) {
  return normalizePathTabs(tabs, currentPath, '/profile');
}

import type { TabDefinition } from '@vben/types';

import { normalizePathTabs } from './normalize-path-tabs';

export const mailTemplatePath = '/system/mail-template';

export function normalizeMailTemplateTabs(
  tabs: TabDefinition[],
  currentPath: string,
) {
  return normalizePathTabs(tabs, currentPath, mailTemplatePath);
}

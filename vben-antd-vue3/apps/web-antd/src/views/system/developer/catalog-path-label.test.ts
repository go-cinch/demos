import { describe, expect, it, vi } from 'vitest';

import { catalogPathLabel } from './catalog-path-label';

vi.mock('#/locales', () => ({ $t: (key: string) => `translated:${key}` }));

describe('catalog conflict path labels', () => {
  it.each([
    [[], '$'],
    [
      ['group_order', '0'],
      'translated:developer.permissionGroups / translated:developer.groupOrder / 0',
    ],
    [
      ['group_defaults', 'admin:users'],
      'translated:developer.permissionGroups / translated:action-editor.groupIsDefault / admin:users',
    ],
    [
      ['messages', 'zh-CN', 'frontend', 'groups', 'admin:users'],
      'translated:developer.permissionGroups / translated:action-editor.groupNames / zh-CN / admin:users',
    ],
    [
      ['resource_catalog', 'resources', 'admin:system:user'],
      'resource_catalog / resources / admin:system:user',
    ],
  ])('labels %j without splitting catalog identifiers', (path, expected) => {
    expect(catalogPathLabel(path as string[])).toBe(expected);
  });
});

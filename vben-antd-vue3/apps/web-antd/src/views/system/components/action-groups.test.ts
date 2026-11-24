import { beforeEach, expect, it, vi } from 'vitest';

import {
  createPermissionGroup,
  deletePermissionGroup,
  savePermissionGroup,
  savePermissionGroupOrder,
} from './action-groups';

const api = vi.hoisted(() => ({
  updateActionGroup: vi.fn(),
  reorderActionGroups: vi.fn(),
}));
vi.mock('#/api/system', () => api);
vi.mock('#/locales/catalog', () => ({
  catalogGroupNames: () => ({ 'en-US': 'Old' }),
  catalogGroupOrder: () => ['admin:system:one', 'admin:system:two'],
}));
beforeEach(() => vi.resetAllMocks());

it('sends just the requested group and the version displayed by the editor', async () => {
  await createPermissionGroup('admin:system:new', { 'en-US': 'New' });
  expect(api.updateActionGroup).toHaveBeenLastCalledWith({
    operation: 'create',
    word: 'admin:system:new',
    names: { 'en-US': 'New' },
  });
  await savePermissionGroup(
    'admin:system:new',
    { 'en-US': 'Updated' },
    'admin:system:old',
    { 'en-US': 'Original' },
  );
  expect(api.updateActionGroup).toHaveBeenLastCalledWith({
    operation: 'update',
    original_word: 'admin:system:old',
    word: 'admin:system:new',
    names: { 'en-US': 'Updated' },
    expected_names: { 'en-US': 'Original' },
  });
  await deletePermissionGroup('admin:system:old');
  expect(api.updateActionGroup).toHaveBeenLastCalledWith({
    operation: 'delete',
    word: 'admin:system:old',
    expected_names: { 'en-US': 'Old' },
  });
});

it('sends the previous order and propagates a rejected reorder so the UI rolls back', async () => {
  api.reorderActionGroups.mockRejectedValue(new Error('order changed'));
  await expect(
    savePermissionGroupOrder(['admin:system:two', 'admin:system:one']),
  ).rejects.toThrow('order changed');
  expect(api.reorderActionGroups).toHaveBeenCalledWith(
    ['admin:system:two', 'admin:system:one'],
    ['admin:system:one', 'admin:system:two'],
  );
});

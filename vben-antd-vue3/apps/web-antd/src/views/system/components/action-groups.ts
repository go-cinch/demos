import { reorderActionGroups, updateActionGroup } from '#/api/system';
import { catalogGroupNames, catalogGroupOrder } from '#/locales/catalog';

export {
  ActionGroupCatalogError,
  applyGroupOrder,
  changePermissionGroup,
  groupNames,
  groupWords,
  recordGroupRename,
  removePermissionGroup,
} from './action-group-model';
export type { GroupCatalog } from './action-group-model';

export function savePermissionGroup(
  word: string,
  names: Record<string, string>,
  original?: string,
  expectedNames?: Record<string, string>,
) {
  return original
    ? updateActionGroup({
        operation: 'update',
        word,
        original_word: original,
        names,
        expected_names: expectedNames ?? catalogGroupNames(original),
      })
    : updateActionGroup({ operation: 'create', word, names });
}

export const createPermissionGroup = (
  word: string,
  names: Record<string, string>,
) => savePermissionGroup(word, names);

export function deletePermissionGroup(
  word: string,
  expectedNames = catalogGroupNames(word),
) {
  return updateActionGroup({
    operation: 'delete',
    word,
    expected_names: expectedNames,
  });
}

export function savePermissionGroupOrder(order: string[]) {
  return reorderActionGroups(order, [...catalogGroupOrder()]);
}

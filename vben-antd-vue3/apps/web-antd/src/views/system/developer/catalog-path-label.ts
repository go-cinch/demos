import { $t } from '#/locales';
import { requiredEntry } from '#/utils/required-entry';

export function catalogPathLabel(path: string[]) {
  let parts = path;
  if (path[0] === 'group_order') {
    parts = [
      $t('developer.permissionGroups'),
      $t('developer.groupOrder'),
      ...path.slice(1),
    ];
  } else if (path[0] === 'group_defaults') {
    parts = [
      $t('developer.permissionGroups'),
      $t('action-editor.groupIsDefault'),
      ...path.slice(1),
    ];
  } else if (
    path[0] === 'messages' &&
    path[2] === 'frontend' &&
    path[3] === 'groups'
  ) {
    parts = [
      $t('developer.permissionGroups'),
      $t('action-editor.groupNames'),
      requiredEntry(path[1], 'resource catalog entry'),
      ...path.slice(4),
    ];
  }
  return parts.join(' / ') || '$';
}

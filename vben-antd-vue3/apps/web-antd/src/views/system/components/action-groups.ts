import type { I18nCatalog } from '#/locales/catalog';
import { listDictionaries, updateDictionary } from '#/api/system';

import { ActionGroupCatalogError, changePermissionGroup, cleanGroupCatalog, removePermissionGroup } from './action-group-model';
export { ActionGroupCatalogError, applyGroupOrder, changePermissionGroup, groupNames, groupWords, removePermissionGroup, recordGroupRename } from './action-group-model';
export type { GroupCatalog } from './action-group-model';

async function loadGroupCatalog() {
  const result = await listDictionaries({ key: 'I18N_CATALOG', p: 1, s: 100, f: 'id,key,value,enabled,updated_at' });
  const record = result.items.find((item) => item.key === 'I18N_CATALOG');
  const source = record?.value as I18nCatalog | undefined;
  if (!record?.enabled || source?.schema_version !== 2 || !source.messages || !Array.isArray(source.locales) || !source.locales.length) {
    throw new ActionGroupCatalogError('groupCatalogUnavailable');
  }
  return { record, source };
}

export async function savePermissionGroup(word: string, names: Record<string, string>, original?: string) {
  const { record, source } = await loadGroupCatalog();
  const document = changePermissionGroup(source, original, word, names);
  await updateDictionary(record.id, { value: document, expected_value: record.value, ...(original && original !== word ? { group_renames: { [original]: word } } : {}) });
}
export const createPermissionGroup = (word: string, names: Record<string, string>) => savePermissionGroup(word, names);
export async function deletePermissionGroup(word: string) {
  const { record, source } = await loadGroupCatalog();
  await updateDictionary(record.id, { value: removePermissionGroup(source, word), expected_value: record.value });
}

export async function savePermissionGroupOrder(order: string[]) {
  const { record, source } = await loadGroupCatalog();
  const document = cleanGroupCatalog(source);
  document.group_order = [...new Set([...order, ...(source.group_order ?? [])])];
  await updateDictionary(record.id, { value: document, expected_value: record.value });
}


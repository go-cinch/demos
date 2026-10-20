import { getAction } from '#/api/system';

// Detail and list controls need config metadata to authorize reserved definitions.
export const actionListFields = ['id', 'name', 'word', 'config'];
const detailFields =
  'id,created_at,updated_at,code,name,group,word,config,resource,menu,button';
const editorFields = 'id,name,names,group,word,scope,config';

export type ActionRecordMode = 'detail' | 'edit';

export function loadActionRecord(
  id: number,
  mode: ActionRecordMode = 'detail',
) {
  return mode === 'edit'
    ? getAction(id, { f: editorFields })
    : getAction(id, { f: detailFields });
}

export function actionEditorName(
  word: string,
  names: Record<string, string> | undefined,
  locale: string,
  defaultLocale: string,
  generatedName?: string,
) {
  return (
    names?.[locale]?.trim() ||
    names?.[defaultLocale]?.trim() ||
    generatedName ||
    word
  );
}

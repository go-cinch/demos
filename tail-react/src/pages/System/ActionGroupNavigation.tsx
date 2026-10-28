import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/api/client';
import { listRecords, updateRecord, type DictionaryRecord } from '@/api/system';
import { useAuth } from '@/context/AuthContext';
import { refreshCatalogMessages } from '@/i18n/catalog';
import { getAdminSummary } from '@/utils/admin/service';
import { type AdminSummary } from '@/utils/admin/model';
import { AButton, AdminDrawer, panelClass } from './admin-ui';
import { fieldClass } from './developer/ResourceEditor';
import { isCatalog } from './developer/catalog-model';
import { changePermissionGroup, cleanGroupCatalog, groupNames, groupWords, removePermissionGroup, isValidActionGroup, type GroupCatalog } from './components/action-group-model';

interface GroupEditor { original?: string; word: string; names: Record<string, string>; initialNames: Record<string, string>; attempted: boolean }
interface PublicCatalog { default_locale: string; locales: GroupCatalog['locales']; group_order?: string[]; messages?: GroupCatalog['messages']; frontend_messages?: Record<string, Record<string, unknown>> }
const validWord = (word: string, scope = 'admin') => isValidActionGroup(word, scope);

export default function ActionGroupNavigation({ selected, onChange, revision, onSaved }: { selected?: string; onChange: (group?: string) => void; revision: number; onSaved: () => void }) {
  const auth = useAuth(); const { t, i18n } = useTranslation(); const d = (key: string) => String(t(`developer.${key}`));
  const [catalog, setCatalog] = useState<GroupCatalog>(); const [summary, setSummary] = useState<AdminSummary>();
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<GroupEditor>(); const [drag, setDrag] = useState<string>(); const [removing, setRemoving] = useState<string>();
  const mutationRun = useRef(0);
  useEffect(() => () => { mutationRun.current++; }, []);
  const canManage = auth.user?.permission.permission_scope === '*' || !!auth.user?.permission.permission_scopes?.includes('action:update');
  const canCreate = canManage && auth.canButton('system.action.create-group');
  const canDelete = canManage && auth.canButton('system.action.delete-group');
  const canReorder = canManage && auth.canButton('system.action.reorder-groups');
  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
  useEffect(() => {
    let active = true; setLoading(true);
    Promise.all([apiRequest<PublicCatalog>('/dictionary/pub/i18n?f=default_locale,locales,group_order,frontend_messages', { auth: false }), getAdminSummary('action')]).then(([value, groups]) => {
      if (!active) return;
      setCatalog({ ...value, messages: value.messages ?? Object.fromEntries(Object.entries(value.frontend_messages ?? {}).map(([tag, frontend]) => [tag, { frontend }])) }); setSummary(groups); setError('');
    }).catch(() => { if (active) setError('loadFailed'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, refresh]);
  const keys = [...new Set([...(catalog?.group_order ?? []), ...(catalog ? groupWords(catalog) : []), ...(summary?.groups.map(group => group.name) ?? [])])];
  const count = (key: string) => summary?.groups.find(group => group.name === key)?.count ?? 0;
  const name = (key: string) => !key ? String(t('pc.system-insights.ungrouped')) : catalog ? groupNames(catalog, key)[locale] || groupNames(catalog, key)[catalog.default_locale] || key : key;
  async function mutate(transform: (source: GroupCatalog) => GroupCatalog, renames?: Record<string, string>, afterSave?: () => void) {
    if (!canManage || loading || saving) return;
    const run = ++mutationRun.current; setSaving(true); setError('');
    try {
      const result = await listRecords<DictionaryRecord>('dictionary', { key: 'I18N_CATALOG', p: 1, s: 100, f: 'id,key,value,enabled,updated_at' });
      if (run !== mutationRun.current) return;
      const record = result.items.find(item => item.key === 'I18N_CATALOG');
      if (!record?.enabled || !isCatalog(record.value)) throw new Error('groupCatalogUnavailable');
      const next = transform(record.value);
      await updateRecord('dictionary', record.id, { value: next, expected_value: record.value, ...(renames ? { group_renames: renames } : {}) });
      await Promise.all([refreshCatalogMessages(), auth.reloadUser()]);
      if (run !== mutationRun.current) return;
      setCatalog(next); setRefresh(value => value + 1); setEditor(undefined); setRemoving(undefined); afterSave?.(); onSaved();
    } catch (cause) {
      if (run === mutationRun.current) setError(cause instanceof Error && ['groupCatalogUnavailable', 'groupExists', 'groupLanguagesChanged', 'groupInUse'].includes(cause.message) ? cause.message : 'submitFailed');
    } finally { if (run === mutationRun.current) setSaving(false); }
  }
  function reorder(from: string, to: string, after = false) {
    if (!canReorder || from === to) return;
    const order = keys.filter(key => key !== from); const at = order.indexOf(to); if (at < 0) return;
    order.splice(at + (after ? 1 : 0), 0, from);
    void mutate(source => ({ ...cleanGroupCatalog(source), group_order: [...new Set([...order, ...(source.group_order ?? [])])] }));
  }
  const word = editor?.word.trim() ?? '';
  const wordError = !!editor?.attempted && (!validWord(word, editor.original?.split(':')[0]) || (word !== editor.original && keys.includes(word)));
  const nameError = !!editor?.attempted && !!catalog && !editor.names[catalog.default_locale]?.trim();
  function saveGroup() {
    if (!editor || !catalog || saving) return;
    setEditor({ ...editor, attempted: true });
    if (!validWord(word, editor.original?.split(':')[0]) || (word !== editor.original && keys.includes(word)) || !editor.names[catalog.default_locale]?.trim()) return;
    const names = Object.fromEntries(Object.entries(editor.names).filter(([tag, value]) => !editor.original || value !== (editor.initialNames[tag] ?? '')));
    void mutate(source => changePermissionGroup(source, editor.original, word, names), editor.original && editor.original !== word ? { [editor.original]: word } : undefined, () => { if (selected === editor.original || !editor.original) onChange(word); });
  }
  return <section className={panelClass} aria-label={t('catalogUI.groups')} data-testid="action-group-navigation">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 [&_button]:py-2"><h2 className="font-semibold">{t('catalogUI.groups')}</h2>{canCreate && <AButton disabled={loading || saving || !catalog} onClick={() => setEditor({ word: 'admin:system:', names: Object.fromEntries((catalog?.locales ?? []).map(locale => [locale.tag, ''])), initialNames: {}, attempted: false })}>{d('addGroup')}</AButton>}</div>
    {error && <p role="alert" className="mb-3 text-error-600">{d(error)}<AButton onClick={() => setRefresh(value => value + 1)}>{d('retry')}</AButton></p>}
    <div className="flex max-h-28 flex-wrap gap-2 overflow-auto [&_button]:px-2 [&_button]:py-1.5" aria-busy={loading || saving}><AButton active={selected === undefined} onClick={() => onChange(undefined)}>{t('catalogUI.all')} {summary?.total}</AButton>{keys.map((key, index) => <div key={key} className={`flex items-center gap-1 rounded-lg border border-gray-200 p-1 dark:border-gray-700 ${loading ? 'animate-pulse' : ''}`} draggable={canReorder && !loading && !saving} onDragStart={event => { setDrag(key); event.dataTransfer.setData('text/plain', key); }} onDragEnd={() => setDrag(undefined)} onDragOver={event => { if (canReorder && drag !== undefined) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (drag !== undefined) { const bounds = event.currentTarget.getBoundingClientRect(); reorder(drag, key, event.clientX > bounds.x + bounds.width / 2); } setDrag(undefined); }}>
      <AButton active={selected === key} ariaKeyShortcuts={canReorder ? 'Alt+ArrowUp Alt+ArrowDown' : undefined} onKeyDown={event => { if (!event.altKey || !canReorder) return; const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0; const target = keys[index + direction]; if (direction && target !== undefined) { event.preventDefault(); reorder(key, target, direction > 0); } }} onClick={() => onChange(selected === key ? undefined : key)}>{name(key)} <span className="text-xs tabular-nums">{count(key)}</span></AButton>
      {canReorder && <><AButton ariaLabel={d('moveUp')} disabled={loading || saving || index === 0} onClick={() => reorder(key, keys[index - 1])}>←</AButton><AButton ariaLabel={d('moveDown')} disabled={loading || saving || index === keys.length - 1} onClick={() => reorder(key, keys[index + 1], true)}>→</AButton></>}
      {canDelete && count(key) === 0 && <AButton danger disabled={loading || saving} ariaLabel={`${d('delete')} ${name(key)}`} onClick={() => setRemoving(key)}>×</AButton>}
    </div>)}</div>
    <AdminDrawer open={!!editor} title={d('addGroup')} onClose={() => { if (!saving) setEditor(undefined); }} footer={<AButton active disabled={saving || loading || !catalog} onClick={saveGroup}>{t('common.save')}</AButton>}>
      {editor && <fieldset disabled={saving} className="space-y-4"><label className="block space-y-1 text-sm"><span>{d('identifier')}</span><input aria-label={d('identifier')} aria-invalid={wordError} className={`${fieldClass} ${wordError ? 'border-error-500' : ''}`} value={editor.word} onChange={event => setEditor({ ...editor, word: event.target.value })}/>{wordError && <span role="alert" className="text-error-600">{d('invalidGroupWord')}</span>}</label>{catalog?.locales.map(value => <label key={value.tag} className="block space-y-1 text-sm"><span>{value.name} · {value.tag}</span><input aria-label={value.name} aria-invalid={nameError && value.tag === catalog.default_locale} className={`${fieldClass} ${nameError && value.tag === catalog.default_locale ? 'border-error-500' : ''}`} value={editor.names[value.tag] ?? ''} onChange={event => setEditor({ ...editor, names: { ...editor.names, [value.tag]: event.target.value } })}/>{nameError && value.tag === catalog.default_locale && <span role="alert" className="text-error-600">{d('groupNameRequired')}</span>}</label>)}{error && <p role="alert" className="text-error-600">{d(error)}</p>}</fieldset>}
    </AdminDrawer>
    <AdminDrawer open={removing !== undefined} title={d('deleteConfirm')} onClose={() => { if (!saving) setRemoving(undefined); }} footer={<AButton danger disabled={saving} onClick={() => { if (removing === undefined) return; const key = removing; void listRecords('action', { group_exact: key, p: 1, s: 1, f: 'id' }).then(result => { if (result.t > 0) setError('groupInUse'); else void mutate(source => removePermissionGroup(source, key), undefined, () => { if (selected === key) onChange(undefined); }); }).catch(() => setError('loadFailed')); }}>{d('delete')}</AButton>}><p>{removing === undefined ? '' : name(removing)}</p></AdminDrawer>
  </section>;
}

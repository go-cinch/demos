import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { registerCloseGuard } from '@/layout/navigationGuard';
import { useTranslation } from 'react-i18next';
import PageMeta from '@/components/common/PageMeta';
import PageBreadCrumb from '@/components/common/PageBreadCrumb';
import Switch from '@/components/form/switch/Switch';
import NotFound from '@/pages/OtherPage/NotFound';
import { AButton, AdminDrawer, panelClass } from './admin-ui';
import SimpleSelect from './SimpleSelect';
import useCatalogDraft from './developer/useCatalogDraft';
import { assign, at, clone, initialUI, isCatalog, merge, messagePaths, normalizeCatalog, text, type Catalog, type Draft } from './developer/catalog-model';
import { createResourceEditor, applyResourceEditor } from './developer/resource-editor-model';
import ResourceEditor, { Field } from './developer/ResourceEditor';
import { moveResource, moveReference, canMoveResource, type ResourceDestination } from './developer/resource-movement';
import ResourceTree from './developer/ResourceTree';
import { resourceChildren, childOrderKey } from './components/resource-order';
import { groupWords, groupNames, changePermissionGroup, removePermissionGroup, recordGroupRename, legacyGroupRenames, isValidActionGroup } from './components/action-group-model';
import { getAdminSummary } from '@/utils/admin/service';
import { type SummaryGroup } from '@/utils/admin/model';
import { legacyResourceRenames, readRenameMap, mergeKeyRenames } from './developer/resource-renames';

export default function DeveloperWorkspace() {
  const state = useCatalogDraft();
  const { t, i18n } = useTranslation(); const d = (key: string) => String(t(`developer.${key}`));
  const file = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [moveKey, setMoveKey] = useState('');
  const [destination, setDestination] = useState('');
  const [confirm, setConfirm] = useState<'discard' | 'publish' | ''>('');
  const [notice, setNotice] = useState('');
  const [groupUsage, setGroupUsage] = useState<SummaryGroup[]>();
  const [groupUsageFailed, setGroupUsageFailed] = useState(false);
  const [groupUsageRevision, setGroupUsageRevision] = useState(0);
  useEffect(() => {
    if (state.draft?.ui.tab !== 'groups') return;
    let active = true; setGroupUsage(undefined); setGroupUsageFailed(false);
    getAdminSummary('action').then(summary => { if (active) setGroupUsage(summary.groups); }).catch(() => { if (active) setGroupUsageFailed(true); });
    return () => { active = false; };
  }, [state.draft?.ui.tab, groupUsageRevision]);
  const [closeResolver, setCloseResolver] = useState<((allowed: boolean) => void) | null>(null);
  const allowNavigation = useRef(false);
  const blocker = useBlocker(({ nextLocation }) => !allowNavigation.current && !nextLocation.pathname.startsWith('/auth/') && !!(state.draft?.ui.resourceEditor || state.draft?.ui.groupEditor || state.draft?.ui.buffer));
  const value = state.draft?.document;
  const ui = state.draft?.ui;
  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
  useEffect(() => registerCloseGuard("/system/developer", async () => {
    if (!state.draft?.ui.resourceEditor && !state.draft?.ui.groupEditor && !state.draft?.ui.buffer) return true;
    return await new Promise<boolean>(resolve => setCloseResolver(() => resolve));
  }), [state.draft?.ui.resourceEditor, state.draft?.ui.groupEditor, state.draft?.ui.buffer]);
  const canEdit = state.canEdit;
  const update = state.update;
  const edit = (action: (value: Catalog, draft: Draft) => void) => update(draft => action(draft.document, draft));
  function fail(cause: unknown) { state.setError(cause instanceof Error ? cause.message : 'invalid'); }
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (ui?.resourceEditor || ui?.groupEditor || ui?.buffer) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before);
  }, [ui?.resourceEditor, ui?.groupEditor, ui?.buffer]);
  if (!state.canRead) return <NotFound />;
  if (!value || !ui) return <div className={panelClass} aria-busy={state.loading}>{state.error ? <div role="alert">{d(state.error)}<AButton onClick={() => void state.initialize()}>{d('retry')}</AButton></div> : d('loading')}</div>;
  const label = (key: string) => text(value, locale, 'resources', key) || key;
  const scope = ui.scope;
  const tab = ui.tab;
  const changeTab = (tab: string) => { if (ui.resourceEditor || ui.groupEditor) { state.setError('unsavedNodeHint'); return; } update(draft => { draft.ui.tab = tab; }); };
  const executeMove = (key: string, destination: ResourceDestination) => {
    if (!canEdit || ui.resourceEditor || ui.groupEditor || ui.buffer) return;
    try {
      const result = moveResource(value, key, destination, ui.resourceRenames);
      if (!result.moved) { setNotice(d('positionUnchanged')); return; }
      update(draft => {
        draft.document = result.document; draft.ui.resource = result.key;
        draft.ui.resourceRenames = mergeKeyRenames(draft.ui.resourceRenames, result.resourceKeys);
        draft.ui.featureRenames = mergeKeyRenames(draft.ui.featureRenames, result.featureKeys);
        draft.ui.expanded = draft.ui.expanded.map(key => result.resourceKeys[key] ?? key);
      });
      setMoveKey(''); setNotice(d('movedWithWords'));
    } catch (cause) { fail(cause); }
  };
  const executeReferenceMove = (owner: string, key: string, destination: ResourceDestination) => {
    if (!canEdit || ui.resourceEditor || ui.groupEditor || ui.buffer) return;
    try {
      const next = moveReference(value, owner, key, destination);
      if (resourceChildren(value.resource_catalog, owner, scope).map(childOrderKey).join('|') === resourceChildren(next.resource_catalog, owner, scope).map(childOrderKey).join('|')) { setNotice(d('positionUnchanged')); return; }
      update(draft => { draft.document = next; }); setNotice(d('referenceOrderSaved'));
    } catch (cause) { fail(cause); }
  };
  const selected = value.resource_catalog.resources[ui.resource];
  const groupCount = (key: string) => groupUsage?.filter(group => (ui.groupRenames[group.name] ?? group.name) === key).reduce((sum, group) => sum + group.count, 0);
  const groupWordInvalid = !!ui.groupEditor?.attempted && !isValidActionGroup(ui.groupEditor.word.trim(), ui.groupEditor.original?.split(':')[0]);
  const groupNameMissing = !!ui.groupEditor?.attempted && !ui.groupEditor.names[value.default_locale]?.trim();
  const exportDraft = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(state.draft, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'I18N_CATALOG-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  async function importFile(file?: File) {
    if (!file || !canEdit) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('importFailed');
      const data = JSON.parse(await file.text()); const imported = isCatalog(data) ? data : data.document;
      if (!isCatalog(imported)) throw new Error('importFailed');
      update(draft => { const renames = legacyResourceRenames(draft.base, imported); draft.document = normalizeCatalog(imported); draft.ui = { ...initialUI(), tab: 'diff', groupRenames: { ...legacyGroupRenames(draft.base, imported), ...readRenameMap(data.ui?.groupRenames) }, resourceRenames: { ...renames.resources, ...readRenameMap(data.ui?.resourceRenames) }, featureRenames: { ...renames.features, ...readRenameMap(data.ui?.featureRenames) } }; });
    } catch (cause) { fail(cause); }
  }
  return <>
    <PageMeta title={`${d('title')} | TailAdmin`} description={d('subtitle')} />
    <PageBreadCrumb pageTitle={d('title')} />
    <div className="space-y-5" data-testid="developer-workspace">
      <section className={panelClass}><h1 className="text-xl font-semibold">{d('title')}</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{d('subtitle')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2"><span role="status" data-testid="draft-status">{state.external ? t('catalogUI.external') : state.storageError ? t('catalogUI.unsaved') : canEdit ? t('catalogUI.saved') : t('catalogUI.readonly')}</span><span className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{state.changes.length}</span>
          <AButton disabled={state.loading || !!ui.resourceEditor} onClick={() => void state.refresh()}>{d('refresh')}</AButton><AButton onClick={exportDraft}>{t('catalogUI.export')}</AButton><AButton disabled={!canEdit} onClick={() => file.current?.click()}>{t('catalogUI.import')}</AButton><AButton disabled={!canEdit} onClick={() => setConfirm('discard')}>{t('catalogUI.discard')}</AButton><AButton disabled={!canEdit || state.storageError || !state.changes.length || !!ui.resourceEditor || !!ui.groupEditor} active onClick={() => { changeTab('diff'); void state.preparePublish().then(ready => { if (ready) setConfirm('publish'); }); }}>{state.publishing ? d('submitting') : t('catalogUI.publish')}</AButton>
          <input ref={file} type="file" hidden accept="application/json,.json" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
      </section>
      {(state.error || notice || state.external) && <div role={state.error ? 'alert' : 'status'} className={`${panelClass} border-warning-300 text-warning-700 dark:text-warning-300`}>{state.error ? d(state.error) : notice}{state.external && <AButton onClick={() => void state.initialize()}>{t('catalogUI.reload')}</AButton>}</div>}
      <section className={panelClass}>
        <div role="tablist" aria-label={d('title')} className="mb-5 flex flex-wrap gap-2">{['languages','resources','groups','messages','scopes','diff'].map(key => <AButton key={key} active={tab === key} onClick={() => changeTab(key)}>{key === 'groups' ? t('catalogUI.groups') : d(key)}</AButton>)}</div>
        {tab === 'resources' && <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{value.scopes.map(key => <AButton key={key} active={scope === key} onClick={() => update(draft => { draft.ui.scope = key; draft.ui.resource = ''; })}>{key}</AButton>)}</div>
          <div className="grid gap-5 lg:grid-cols-3"><aside className="space-y-3"><Field title={d('search')} value={query} onChange={setQuery} /><AButton disabled={!canEdit} onClick={() => update(draft => { draft.ui.resourceEditor = createResourceEditor(draft.document, scope); })}>{d('addDirectory')}</AButton><ResourceTree catalog={value} scope={scope} query={query} editable={canEdit && !ui.resourceEditor && !ui.groupEditor && !ui.buffer} selected={ui.resource} label={label} onSelect={key => update(draft => { draft.ui.resource = key; })} onMove={executeMove} onReferenceMove={executeReferenceMove}/></aside>
            <article className="space-y-4 lg:col-span-2">{selected ? <><h2 className="text-xl font-semibold">{label(ui.resource)}</h2><code className="block break-words text-sm">{ui.resource}</code><div className="flex flex-wrap gap-2"><AButton disabled={!canEdit} onClick={() => update(draft => { draft.ui.resourceEditor = createResourceEditor(draft.document, scope, ui.resource); })}>{d('edit')}</AButton>{selected.kind === 'directory' && <AButton disabled={!canEdit} onClick={() => update(draft => { draft.ui.resourceEditor = createResourceEditor(draft.document, scope, '', ui.resource); })}>{d('addResource')}</AButton>}<AButton disabled={!canEdit} onClick={() => { setMoveKey(ui.resource); setDestination(selected.parent ?? ''); }}>{d('moveTo')}</AButton><AButton disabled={!canEdit} danger onClick={() => edit(document => {
              const nodes = document.resource_catalog.resources;
              if (Object.values(nodes).some(node => node.parent === ui.resource || node.references?.includes(ui.resource))) throw new Error('referenceInUse');
              for (const operation of Object.values(nodes[ui.resource]?.operations ?? {})) for (const feature of operation.button_keys) { delete document.resource_catalog.buttons[feature]; for (const messages of Object.values(document.messages)) if (messages.frontend && typeof messages.frontend === 'object') Reflect.deleteProperty((messages.frontend as Record<string, object>).features ?? {}, feature); }
              delete nodes[ui.resource]; for (const node of Object.values(nodes)) if (node.child_order) node.child_order = node.child_order.filter(item => item.key !== ui.resource);
              for (const messages of Object.values(document.messages)) if (messages.frontend && typeof messages.frontend === 'object') Reflect.deleteProperty((messages.frontend as Record<string, object>).resources ?? {}, ui.resource);
            })}>{d('delete')}</AButton></div>
              <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(selected.entries ?? {}).map(([key, entry]) => <div key={key} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><dt className="font-medium">{key}</dt><dd>{entry.path}</dd></div>)}</dl>
              {Object.entries(selected.operations ?? {}).map(([operation, binding]) => <section key={operation} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"><h3 className="font-semibold">{t(`operations.${operation}`, {defaultValue: operation})}</h3>{binding.button_keys.map(key => <details key={key} className="rounded border border-gray-200 p-2 dark:border-gray-700"><summary className="cursor-pointer">{text(value, locale, 'features', key) || key}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value.resource_catalog.buttons[key], null, 2)}</pre></details>)}</section>)}
              {(selected.references ?? []).map(key => <button key={key} className="block text-brand-500 hover:underline" type="button" onClick={() => update(draft => { draft.ui.resource = key; })}>↗ {label(key)} · {(selected.reference_operations?.[key] ?? []).join(', ')}</button>)}
            </> : <p>{d('selectResource')}</p>}</article>
          </div>
        </div>}
        {tab === 'languages' && <div className="space-y-4"><SimpleSelect ariaLabel={d('defaultLocale')} value={value.default_locale} options={value.locales.filter(item => item.enabled).map(item => ({ value: item.tag, label: item.name }))} onChange={locale => edit(document => { document.default_locale = String(locale); })} />{value.locales.map((item, index) => <div className="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-3 dark:border-gray-700" key={index}><Field title={d('localeTag')} value={item.tag} onChange={tag => edit(document => { const old = document.locales[index].tag; document.locales[index].tag = tag; if (document.messages[old]) { document.messages[tag] = document.messages[old]; delete document.messages[old]; } if (document.default_locale === old) document.default_locale = tag; })} /><Field title={d('localeName')} value={item.name} onChange={name => edit(document => { document.locales[index].name = name; })} /><Switch checked={item.enabled} label={d('enabled')} onChange={enabled => edit(document => { if (!enabled && document.default_locale === item.tag) throw new Error('defaultLocaleRequired'); document.locales[index].enabled = enabled; })} /><AButton disabled={!canEdit || item.tag === value.default_locale} danger onClick={() => edit(document => { document.locales.splice(index,1); delete document.messages[item.tag]; })}>{d('delete')}</AButton></div>)}<AButton disabled={!canEdit} onClick={() => edit(document => { document.locales.push({ tag: '', name: '', enabled: false }); })}>{d('addLocale')}</AButton></div>}
        {tab === 'groups' && <div className="space-y-3">{groupUsageFailed && <p role="alert">{d('loadFailed')}<AButton onClick={() => setGroupUsageRevision(value => value + 1)}>{d('retry')}</AButton></p>}<AButton disabled={!canEdit} onClick={() => update(draft => { draft.ui.groupEditor = { original: '', word: `${scope}:system:`, names: Object.fromEntries(value.locales.map(locale => [locale.tag, ''])), attempted: false, isDefault: false }; })}>{d('addGroup')}</AButton>{[...new Set([...(value.group_order ?? []), ...groupWords(value)])].map((key, index, keys) => <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"><span className="min-w-0 flex-1 break-words">{groupNames(value,key)[locale] || key} · {groupCount(key) ?? '…'}<code className="ms-2 text-xs">{key}</code></span><AButton disabled={!canEdit || index === 0} onClick={() => edit(document => { const order = [...keys]; [order[index-1],order[index]]=[order[index],order[index-1]]; document.group_order=order; })}>↑</AButton><AButton disabled={!canEdit || index === keys.length-1} onClick={() => edit(document => { const order=[...keys]; [order[index+1],order[index]]=[order[index],order[index+1]]; document.group_order=order; })}>↓</AButton><AButton disabled={!canEdit} onClick={() => update(draft => { draft.ui.groupEditor = { original:key, word:key,names:groupNames(value,key),attempted:false,type:ui.groupTypes[key]??0,isDefault:value.group_defaults?.[key]===true }; })}>{d('edit')}</AButton><AButton danger disabled={!canEdit || groupCount(key)!==0 || Object.values(value.resource_catalog.resources).some(node=>node.permission_group===key)} onClick={() => update(draft => { draft.document=removePermissionGroup(draft.document,key); })}>{d('delete')}</AButton></div>)}</div>}
        {tab === 'scopes' && <div className="space-y-3">{value.scopes.map(key => <div key={key} className="flex items-center gap-3"><code className="flex-1">{key}</code><AButton danger disabled={!canEdit || Object.keys(value.resource_catalog.resources).some(resource=>resource.startsWith(`${key}:`))} onClick={() => edit(document=>{document.scopes=document.scopes.filter(scope=>scope!==key);})}>{d('delete')}</AButton></div>)}<Field title={d('scope')} value={ui.newScope} onChange={value=>update(draft=>{draft.ui.newScope=value;})}/><AButton disabled={!canEdit} onClick={()=>edit((document,draft)=>{const key=draft.ui.newScope.trim();if(!/^[a-z][a-z0-9_-]*$/.test(key)||document.scopes.includes(key))throw new Error('invalid');document.scopes.push(key);draft.ui.newScope='';})}>{d('addScope')}</AButton></div>}
        {tab === 'messages' && <div className="space-y-4"><div className="flex gap-2">{['frontend','backend'].map(category=><AButton key={category} active={ui.category===category} onClick={()=>update(draft=>{draft.ui.category=category;draft.ui.messagePage=1;})}>{d(category)}</AButton>)}</div><Field title={d('search')} value={ui.messageQuery} onChange={value=>update(draft=>{draft.ui.messageQuery=value;draft.ui.messagePage=1;})}/><AButton disabled={!canEdit} onClick={()=>update(draft=>{draft.ui.buffer={kind:'message',original:'',key:'',parent:'',zh:'',en:'',nodeKind:'resource',sort:0,operation:'read',path:'',parentMenu:'',buttons:[],http:[],grpc:[],category:ui.category};})}>{d('addMessage')}</AButton>
          {[...new Map(value.locales.flatMap(locale=>messagePaths(value.messages[locale.tag]?.[ui.category])).map(path=>[JSON.stringify(path),path])).values()].filter(path=>path.join('.').toLowerCase().includes(ui.messageQuery.toLowerCase())).slice(0,ui.messagePage*30).map(path=><div key={JSON.stringify(path)} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"><code className="block break-words">{path.join('.')}</code><div className="grid gap-3 md:grid-cols-2">{value.locales.map(locale=><Field key={locale.tag} title={locale.name} value={String(at(value.messages,[locale.tag,ui.category,...path])??'')} disabled={!canEdit} onChange={text=>edit(document=>assign(document.messages,[locale.tag,ui.category,...path],text))}/>)}</div><AButton disabled={!canEdit} danger onClick={()=>edit(document=>{for(const locale of document.locales)assign(document.messages,[locale.tag,ui.category,...path],undefined);})}>{d('delete')}</AButton></div>)}<AButton onClick={()=>update(draft=>{draft.ui.messagePage++;})}>{d('loadMore')}</AButton></div>}
        {tab === 'diff' && <div className="space-y-4"><h2 className="font-semibold">{t('catalogUI.compare')} · {state.changes.length}</h2><AButton disabled={!canEdit || !state.online} onClick={()=>update(draft=>{if(!state.online)return;const result=merge(draft.base,draft.document,state.online);const base=clone(state.online);for(const conflict of result.conflicts)assign(base,conflict.path,conflict.base);draft.document=result.document;draft.base=base;})}>{d('mergeOnline')}</AButton>
          {state.conflicts.map(conflict=><div key={JSON.stringify(conflict.path)} className="rounded-lg border border-warning-400 p-3"><strong>{t('catalogUI.conflicts')}: {conflict.path.join(' / ')}</strong><div className="grid gap-2 md:grid-cols-2">{[conflict.before,conflict.after].map((value,index)=><pre key={index} className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value,null,2)}</pre>)}</div><div className="mt-2 flex gap-2"><AButton disabled={!canEdit} onClick={()=>update(draft=>{assign(draft.document,conflict.path,conflict.before);assign(draft.base,conflict.path,conflict.before);})}>{t('catalogUI.useOnline')}</AButton><AButton disabled={!canEdit} onClick={()=>update(draft=>assign(draft.base,conflict.path,conflict.before))}>{t('catalogUI.useLocal')}</AButton></div></div>)}
          <div data-testid="catalog-validation-errors" role={state.problems.some(problem=>!problem.warning)?'alert':undefined}>{state.problems.map((problem,index)=><p key={index} className={problem.warning?'text-warning-600':'text-error-600'}>{d(problem.code)}: {problem.path.join(' / ')}</p>)}</div>
          {state.changes.map((change,index)=><details key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><summary className="cursor-pointer break-words">{d(change.kind)} · {change.path.join(' / ')}</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(change.before,null,2)}</pre><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(change.after,null,2)}</pre></div></details>)}
        </div>}
      </section>
    </div>
    <AdminDrawer open={!!ui.resourceEditor} title={d('editResource')} onClose={()=>update(draft=>{draft.ui.resourceEditor=null;})} footer={<><AButton onClick={()=>update(draft=>{draft.ui.resourceEditor=null;})}>{d('cancel')}</AButton><AButton active disabled={!canEdit} onClick={()=>{if(!ui.resourceEditor)return;try{const next=applyResourceEditor(value,scope,ui.resourceEditor,ui.resourceRenames);update(draft=>{draft.document=next;draft.ui.resource=ui.resourceEditor!.key;draft.ui.resourceEditor=null;});}catch(cause){fail(cause);}}}>{d('saveToDraft')}</AButton></>}>
      {ui.resourceEditor && <ResourceEditor catalog={value} editor={ui.resourceEditor} disabled={!canEdit} onChange={editor=>update(draft=>{draft.ui.resourceEditor=editor;})}/>}
      {state.error&&<p role="alert" className="mt-3 text-error-600">{d(state.error)}</p>}
    </AdminDrawer>
    <AdminDrawer open={!!ui.groupEditor} title={d('editGroup')} onClose={()=>update(draft=>{draft.ui.groupEditor=null;})} footer={<AButton disabled={!canEdit} active onClick={()=>{try{const group=ui.groupEditor!;update(draft=>{draft.ui.groupEditor!.attempted=true;});if(!isValidActionGroup(group.word.trim(),group.original?.split(':')[0])||!group.names[value.default_locale]?.trim())return;const word=group.word.trim();const next=changePermissionGroup(value,group.original||undefined,word,group.names,group.isDefault);update(draft=>{draft.document=next;draft.ui.groupTypes[word]=group.type??0;if(group.original&&group.original!==word){delete draft.ui.groupTypes[group.original];draft.ui.groupRenames=recordGroupRename(draft.ui.groupRenames,group.original,word);}draft.ui.groupEditor=null;});}catch(cause){fail(cause);}}}>{d('saveToDraft')}</AButton>}>
      {ui.groupEditor&&<div className="space-y-3"><Field error={groupWordInvalid} title={d('identifier')} value={ui.groupEditor.word} onChange={word=>update(draft=>{draft.ui.groupEditor!.word=word;})}/>{groupWordInvalid&&<p role="alert" className="text-error-600">{d('invalidGroupWord')}</p>}{value.locales.map(locale=><Field key={locale.tag} error={groupNameMissing&&locale.tag===value.default_locale} title={locale.name} value={ui.groupEditor!.names[locale.tag]??''} onChange={name=>update(draft=>{draft.ui.groupEditor!.names[locale.tag]=name;})}/>)}{groupNameMissing&&<p role="alert" className="text-error-600">{d('groupNameRequired')}</p>}<SimpleSelect ariaLabel={d('groupType')} value={ui.groupEditor.type??0} options={[0,1,2].map(type=>({value:type,label:d(['groupTypeNormal','groupTypeDefault','groupTypeRisk'][type])}))} onChange={type=>update(draft=>{draft.ui.groupEditor!.type=Number(type) as 0|1|2;})}/><p className="text-sm text-gray-500 dark:text-gray-400">{d('groupTypeHint')}</p><Switch checked={ui.groupEditor.isDefault} label={d('defaultGroup')} onChange={isDefault=>update(draft=>{draft.ui.groupEditor!.isDefault=isDefault;})}/>{state.error&&<p role="alert" className="text-error-600">{d(state.error)}</p>}</div>}
    </AdminDrawer>
    <AdminDrawer open={!!moveKey} title={d('moveTo')} onClose={()=>setMoveKey('')} footer={<AButton active disabled={!canEdit||!canMoveResource(value,moveKey,destination)} onClick={()=>executeMove(moveKey,{parent:destination})}>{d('confirmMove')}</AButton>}><SimpleSelect ariaLabel={d('selectMoveDirectory')} value={destination} options={[{value:'',label:d('root')},...Object.entries(value.resource_catalog.resources).filter(([key,node])=>node.kind==='directory'&&canMoveResource(value,moveKey,key)).map(([key])=>({value:key,label:label(key)}))]} onChange={value=>setDestination(String(value))}/></AdminDrawer>
    <AdminDrawer open={!!ui.buffer} title={d('addMessage')} onClose={()=>update(draft=>{draft.ui.buffer=null;})} footer={<AButton active disabled={!canEdit} onClick={()=>edit((document,draft)=>{const buffer=draft.ui.buffer!;if(!buffer.key.trim()||!buffer.zh.trim()||!buffer.en.trim())throw new Error('required');for(const [locale,text]of [['zh-CN',buffer.zh],['en-US',buffer.en]])assign(document.messages,[locale,buffer.category,...buffer.key.split('.')],text);draft.ui.buffer=null;})}>{d('saveToDraft')}</AButton>}>{ui.buffer&&<div className="space-y-3">{(['key','zh','en']as const).map(key=><Field key={key} title={d(key==='key'?'identifier':key==='zh'?'nameZh':'nameEn')} value={ui.buffer![key]} onChange={value=>update(draft=>{draft.ui.buffer![key]=value;})}/>)}</div>}</AdminDrawer>
    <AdminDrawer open={blocker.state === 'blocked' || !!closeResolver} title={d('unsavedNodeTitle')} onClose={() => { if (blocker.state === 'blocked') blocker.reset(); closeResolver?.(false); setCloseResolver(null); }} footer={<><AButton onClick={() => { if(blocker.state === 'blocked')blocker.reset();closeResolver?.(false);setCloseResolver(null); }}>{d('continue')}</AButton><AButton danger onClick={() => {allowNavigation.current=true;update(draft=>{draft.ui.resourceEditor=null;draft.ui.groupEditor=null;draft.ui.buffer=null;});closeResolver?.(true);setCloseResolver(null);if(blocker.state==='blocked')blocker.proceed();}}>{d('discardAndLeave')}</AButton></>}><p>{d('unsavedNodeHint')}</p></AdminDrawer>
    <AdminDrawer open={!!confirm} title={d(confirm==='publish'?'submitConfirm':'discardConfirm')} onClose={()=>setConfirm('')} footer={<><AButton onClick={()=>setConfirm('')}>{d('cancel')}</AButton><AButton active onClick={()=>{if(confirm==='discard')update(draft=>{if(!state.online)return;draft.base=clone(state.online);draft.document=clone(state.online);draft.ui=initialUI();});else void state.publish().then(success=>{if(success)setNotice(d('submitSuccess'));});setConfirm('');}}>{confirm==='publish'?t('catalogUI.publish'):t('catalogUI.discard')}</AButton></>}><p>{d(confirm==='publish'?'submitConfirmHint':'discardHint')}</p><p className="mt-3">{state.changes.length}</p></AdminDrawer>
  </>;
}

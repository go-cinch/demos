import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getPermissionCatalog, listRecords, type ActionConfig, type ActionRecord, type ActionResourceBinding, type PermissionCatalog } from '@/api/system';
import { AButton } from './admin-ui';
import { actionSelection, normalizeSelection, toggleSelectionFeature } from './components/permission-selection';
import { actionResourceBindings, resolveResourceBindings } from './components/resource-catalog';
import { orderPermissionResourceKeys, resourceReferenceTree, type ReferenceTreeNode } from './components/resource-references';
import { resourceOperationKeys, resourceTreeSelectionState, toggleResourceTreeSelection } from './components/resource-tree-selection';
import { permissionScopeView } from './components/permission-scope';
import { expandEffectiveSelection } from './components/permission-sources';

function SelectionBox({ checked, partial, disabled, label, onChange }: { checked: boolean; partial?: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  const element = useRef<HTMLInputElement>(null);
  useEffect(() => { if (element.current) element.current.indeterminate = !!partial; }, [partial]);
  return <label className="inline-flex items-start gap-2 text-sm"><input ref={element} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>;
}
export default function PermissionEditor({ codes = [], bindings, config, actions, definition = false, disabled = false, readOnly = false, onChange, onValidity }: {
  codes?: string[]; bindings?: ActionResourceBinding[]; config?: ActionConfig; actions?: {code: string; word: string; config?: ActionConfig}[]; definition?: boolean; disabled?: boolean; readOnly?: boolean;
  onChange: (bindings: ActionResourceBinding[]) => void; onValidity?: (valid: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [catalog, setCatalog] = useState<PermissionCatalog>();
  const [resolved, setResolved] = useState<ActionResourceBinding[]>([]);
  const [error, setError] = useState(false);
  const [unresolved, setUnresolved] = useState(0);
  const [retry, setRetry] = useState(0);
  const [scope, setScope] = useState('admin');
  const [directory, setDirectory] = useState('');
  const [query, setQuery] = useState('');
  const codeKey = codes.join(',');
  useEffect(() => {
    let active = true;
    setError(false); onValidity?.(false);
    getPermissionCatalog().then(async value => {
      const selected = config ? actionResourceBindings(config) : [];
      if (config?.builtin && !selected.length) selected.push(...actionSelection(value.resource_catalog, { code: '', word: `${scope}:`, config }));
      const definitions = new Map((actions ?? []).filter(action => action.config).map(action => [action.code, action]));
      const requested = [...new Set([...codes, ...(actions ?? []).map(action => action.code)])];
      const missing = requested.filter(code => !definitions.has(code));
      for (let offset = 0; offset < missing.length; offset += 100) {
        const chunk = missing.slice(offset, offset + 100);
        for (let p = 1; ; p++) {
          const result = await listRecords<ActionRecord>('action', { code: `${chunk.join(',')},`, p, s: 100, f: 'id,code,word,config' });
          if (!active) return;
          for (const item of result.items) definitions.set(item.code, item);
          if (result.p * result.s >= result.t || !result.items.length) break;
        }
      }
      let unknown = 0;
      for (const code of requested) {
        try {
          const action = definitions.get(code);
          if (!action) throw new Error('unresolved');
          selected.push(...actionSelection(value.resource_catalog, action));
        } catch { unknown++; }
      }
      if (active) { setCatalog(value); setResolved(normalizeSelection(value.resource_catalog, selected)); setUnresolved(unknown); onValidity?.(unknown === 0); }
    }).catch(() => { if (active) { setError(true); onValidity?.(false); } });
    return () => { active = false; };
    // The owner remounts the editor for a different record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeKey, retry]);
  const selected = bindings ?? resolved;
  const effective = useMemo(() => catalog && (readOnly || disabled) ? expandEffectiveSelection(catalog.resource_catalog, selected) : selected, [catalog, selected, readOnly, disabled]);
  const label = (key: string, kind = 'resources') => String(t(`${kind}.${key}`, { defaultValue: key }));
  if (error) return <div role="alert">{t('catalogUI.unresolved')}<AButton onClick={() => setRetry(value => value + 1)}>{t('catalogUI.retry')}</AButton></div>;
  if (!catalog) return <p aria-busy="true">{t('catalogUI.loading')}</p>;
  const rc = catalog.resource_catalog;
  const tree = resourceReferenceTree(rc, scope, '', key => label(key));
  const scopeSelection = permissionScopeView(rc, scope, selected);
  const scopeEffective = permissionScopeView(rc, scope, effective);
  const ordered = orderPermissionResourceKeys(rc, scope, scopeSelection.resourceKeys);
  const descendants = (key: string, seen = new Set<string>()): string[] => {
    if (seen.has(key)) return []; seen.add(key);
    const node = rc.resources[key];
    return [key, ...Object.entries(rc.resources).filter(([,node]) => node.parent === key).flatMap(([child]) => descendants(child, seen)), ...(node?.references ?? []).flatMap(child => descendants(child,seen))];
  };
  const visible = ordered.filter(key => { const node = rc.resources[key]; return node.kind === 'resource' && (!directory || descendants(directory).includes(key)) && `${key} ${label(key)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()); });
  const choose = (next: ActionResourceBinding[]) => { if (disabled || readOnly) return; onChange(normalizeSelection(rc, next)); onValidity?.(unresolved === 0); };
  const changeBinding = (key: string, operation: string, checked: boolean) => {
    const rest = selected.filter(item => item.resource_key !== key || item.operation !== operation);
    choose(checked ? [...rest, { resource_key: key, operation, feature_keys: [...(rc.resources[key]?.operations?.[operation]?.button_keys ?? [])] }] : rest);
  };
  const changeFeature = (key: string, operation: string, feature: string, checked: boolean) => {
    if (disabled || readOnly || (definition && !selected.some(binding => binding.resource_key === key && binding.operation === operation))) return;
    choose(toggleSelectionFeature(rc, selected, key, operation, feature, checked, definition));
  };
  const renderTree = (nodes: ReferenceTreeNode[]): ReactNode => <ul className="space-y-1">{nodes.map(node => {
    const key = node.referenceTarget ?? node.key;
    const state = resourceTreeSelectionState(rc, scope, effective, key, node.referenceOwner);
    return <li key={node.key}><button type="button" aria-pressed={state.partial ? 'mixed' : state.all} aria-current={directory === key ? 'location' : undefined}
      data-permission-tree-key={node.key}
      className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-start text-sm hover:bg-gray-100 aria-pressed:bg-brand-50 aria-pressed:text-brand-700 dark:hover:bg-gray-800 dark:aria-pressed:bg-brand-500/15 dark:aria-pressed:text-brand-300 ${state.partial ? 'bg-brand-25 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : ''}`}
      onClick={() => {
        setDirectory(key);
        if (!readOnly && !disabled) choose(toggleResourceTreeSelection(rc, scope, selected, key, node.referenceOwner));
      }}>
      {!readOnly && <span aria-hidden="true" className="mt-0.5 inline-grid size-4 shrink-0 place-items-center rounded border border-gray-300 text-xs dark:border-gray-600">{state.all ? '✓' : state.partial ? '−' : ''}</span>}
      <span>{node.referenceTarget ? '↗ ' : ''}{label(key)}</span>
    </button>{node.children.length > 0 && <div className="ps-3">{renderTree(node.children)}</div>}</li>;
  })}</ul>;
  let effects: ActionConfig | undefined;
  try { effects = resolveResourceBindings(rc, scope, scopeSelection.bindings); } catch { /* Missing mappings remain visible as selections. */ }
  return <div className="space-y-4" data-testid={readOnly ? 'permission-detail' : 'permission-assignment'} lang={i18n.language}>
    {unresolved > 0 && <p role="alert" className="rounded-lg border border-warning-300 p-3 text-warning-700 dark:text-warning-300">{t('catalogUI.unresolved')} · {unresolved}<AButton onClick={() => setRetry(value => value + 1)}>{t('catalogUI.retry')}</AButton></p>}
    <div className="flex flex-wrap gap-3">{catalog.scopes.map(value => <button type="button" key={value} aria-pressed={scope === value} className="min-w-28 rounded-xl border border-gray-200 bg-gray-50 p-3 text-start aria-pressed:border-brand-500 aria-pressed:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:aria-pressed:bg-brand-500/15" onClick={() => { setScope(value); setDirectory(''); }}><strong className="block">{label(value,'scopes')}</strong><span className="text-xs text-gray-500 dark:text-gray-400">{permissionScopeView(rc, value, effective).count}</span></button>)}</div>
    <div className="grid gap-4 lg:grid-cols-4"><aside className="space-y-2 rounded-xl border border-gray-200 p-2 lg:col-span-1 dark:border-gray-700"><AButton active={!directory} onClick={() => setDirectory('')}>{t('catalogUI.resources')}</AButton>{renderTree(tree)}</aside>
      <div className="space-y-3 lg:col-span-3"><input aria-label={t('catalogUI.resources')} placeholder={t('catalogUI.resources')} className="w-full rounded-lg border border-gray-300 bg-transparent p-3 dark:border-gray-700" value={query} onChange={event => setQuery(event.target.value)} />
        {!visible.length ? <p role="status" data-testid="permission-scope-empty" className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">{t('catalogUI.emptyScopeResources')}</p> : !scopeEffective.bindings.length && <p className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">{t('catalogUI.empty')}</p>}
        {visible.map(key => {
          const node = rc.resources[key]; const available = resourceOperationKeys(rc, key);
          const picked = effective.filter(binding => binding.resource_key === key);
          const full = available.length > 0 && available.every(operation => { const binding = picked.find(item => item.operation === operation); return binding && (node.operations?.[operation]?.button_keys ?? []).every(feature => binding.feature_keys?.includes(feature)); });
          return <section key={key} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700" data-resource={key}>
            <div className="flex flex-wrap items-center justify-between gap-2"><SelectionBox label={label(key)} checked={full} partial={picked.length > 0 && !full} disabled={disabled || readOnly} onChange={checked => { const rest = selected.filter(binding=>binding.resource_key!==key); choose(checked ? [...rest,...available.map(operation=>({resource_key:key,operation,feature_keys:[...(node.operations?.[operation]?.button_keys??[])]}))] : rest); }} /><code className="text-xs break-words text-gray-500 dark:text-gray-400">{key}</code></div>
            {available.map(operation => { const binding = picked.find(item => item.operation === operation); const features = node.operations?.[operation]?.button_keys ?? []; return <div key={operation} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"><SelectionBox label={operation === '*' ? t('catalogUI.all') : label(operation,'operations')} checked={!!binding} disabled={disabled || readOnly} onChange={checked=>changeBinding(key,operation,checked)} />
              <div className="mt-2 grid gap-2 ps-5 md:grid-cols-2">{features.map(feature => <div key={feature}><SelectionBox label={label(feature,'features')} checked={binding?.feature_keys?.includes(feature) ?? false} disabled={disabled || readOnly || (definition && !binding)} onChange={checked=>changeFeature(key,operation,feature,checked)} /><details className="mt-1 text-xs text-gray-500 dark:text-gray-400"><summary className="cursor-pointer">{t('catalogUI.details')}</summary><div className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{rc.buttons[feature]?.btn.map(key=><p key={key}>{label(key,'buttons')}</p>)}{rc.buttons[feature]?.http.map(item=><p key={`${item.method}:${item.path}`}>{item.method} {item.path}</p>)}{rc.buttons[feature]?.grpc.map(path=><p key={path}>{path}</p>)}</div></details></div>)}</div>
            </div>; })}
          </section>;
        })}
      </div>
    </div>
    {effects && <details className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><summary className="cursor-pointer font-medium">{t('permission-assignment.preview',{defaultValue:t('catalogUI.details')})}</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><div>{effects.ui.filter(entry=>entry.page_entry).map(entry=><p key={entry.menu_key} className="break-words">{label(entry.menu_key,'menus')} · {entry.menu_path}</p>)}</div><div className="max-h-64 overflow-auto text-sm">{effects.ui.flatMap(entry=>entry.button_keys??[]).map(key=><p key={key}>{label(key,'buttons')}</p>)}{effects.endpoints.map((endpoint,index)=><p key={index}>{endpoint.method} {endpoint.path}</p>)}</div></div></details>}
  </div>;
}

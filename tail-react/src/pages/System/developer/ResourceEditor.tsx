import { useTranslation } from 'react-i18next';
import { type Catalog, type ResourceEditor as Editor, type ResourceFeatureDraft } from './catalog-model';
import { canReferenceResource, availableReferenceOperations } from '../components/resource-references';
import SimpleSelect from '../SimpleSelect';
import { AButton } from '../admin-ui';
import Switch from '@/components/form/switch/Switch';
export const fieldClass = 'w-full rounded-lg border border-gray-300 bg-transparent p-2 text-sm dark:border-gray-700 dark:text-white/90';
export const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
export function Field({ title, value, onChange, multiline = false, disabled = false, error = false }: { title: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; error?: boolean }) {
  return <label className="block space-y-1 text-sm"><span>{title}</span>{multiline ? <textarea disabled={disabled} aria-label={title} aria-invalid={error} className={`${fieldClass} ${error ? 'border-error-500' : ''} max-h-64 min-h-24 overflow-auto`} value={value} onChange={event => onChange(event.target.value)} /> : <input disabled={disabled} aria-label={title} aria-invalid={error} className={`${fieldClass} ${error ? 'border-error-500' : ''}`} value={value} onChange={event => onChange(event.target.value)} />}</label>;
}
const operations = ['read', 'create', 'update', 'delete'];
export default function ResourceEditor({ catalog, editor, disabled, onChange }: { catalog: Catalog; editor: Editor; disabled: boolean; onChange: (editor: Editor) => void }) {
  const { t } = useTranslation(); const d = (key: string) => t(`developer.${key}`);
  const update = (patch: Partial<Editor>) => onChange({ ...editor, ...patch });
  const changeFeature = (index: number, patch: Partial<ResourceFeatureDraft>) => update({ features: editor.features.map((feature, i) => i === index ? { ...feature, ...patch } : feature) });
  return <fieldset disabled={disabled} className="space-y-5" data-testid="resource-node-editor">
    <div className="grid gap-3 md:grid-cols-2">
      <Field title={d('identifier')} value={editor.key} disabled={!!editor.original} onChange={key => update({ key })} />
      <SimpleSelect ariaLabel={d('nodeType')} value={editor.nodeKind} options={['directory','resource'].map(value => ({ value, label: d(value) }))} onChange={kind => update({ nodeKind: kind as Editor['nodeKind'] })} />
      <Field title={d('nameZh')} value={editor.zh} onChange={zh => update({ zh })} />
      <Field title={d('nameEn')} value={editor.en} onChange={en => update({ en })} />
      <Field title={d('sort')} value={String(editor.sort)} onChange={sort => update({ sort: Number(sort) })} />
      <Field title={d('position')} value={String(editor.position ?? '')} onChange={position => update({ position: Number(position) })} />
    </div>
    {!editor.parent && editor.nodeKind === 'directory' && <Switch checked={editor.frontendVisible} label={d('frontendVisible')} onChange={frontendVisible => update({ frontendVisible })} />}
    {editor.nodeKind === 'resource' && <>
      <SimpleSelect ariaLabel={d('permissionScope')} value={editor.permissionScope ?? ''} options={[{ value: '', label: d('configuredScope') }, { value: '*', label: d('allScope') }]} onChange={value => update({ permissionScope: value as '' | '*' })} />
      {editor.permissionScope !== '*' && <><div className="flex flex-wrap gap-3">{operations.map(operation => <label key={operation} className="flex gap-2"><input type="checkbox" checked={editor.operations.includes(operation)} onChange={event => update({ operations: event.target.checked ? [...editor.operations, operation] : editor.operations.filter(value => value !== operation) })} />{t(`operations.${operation}`, { defaultValue: operation })}</label>)}</div>
      <section className="space-y-3"><h3 className="font-semibold">{d('entries')}</h3>
        {editor.entries.map((entry, index) => <div key={index} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          {(['key','path','parentMenu'] as const).map(key => <Field key={key} title={d(key === 'key' ? 'menuKey' : key === 'path' ? 'menuPath' : 'parentMenu')} value={entry[key]} onChange={value => update({ entries: editor.entries.map((item, i) => i === index ? { ...item, [key]: value } : item) })} />)}
          <div className="flex gap-3">{editor.operations.map(operation => <label key={operation} className="flex gap-2"><input type="checkbox" checked={entry.operations.includes(operation)} onChange={event => update({ entries: editor.entries.map((item, i) => i === index ? { ...item, operations: event.target.checked ? [...item.operations, operation] : item.operations.filter(value => value !== operation) } : item) })} />{t(`operations.${operation}`, { defaultValue: operation })}</label>)}</div>
          <AButton danger onClick={() => update({ entries: editor.entries.filter((_, i) => i !== index) })}>{d('remove')}</AButton>
        </div>)}
        <AButton onClick={() => update({ entries: [...editor.entries, { key: `${editor.key.replace(':', ':menu:')}`, path: '/', parentMenu: '', operations: ['read'] }] })}>{d('addEntry')}</AButton>
      </section>
      <section className="space-y-3"><h3 className="font-semibold">{d('features')}</h3>
        {editor.features.map((feature, index) => <details key={index} open className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"><summary className="cursor-pointer font-medium">{feature.en || feature.key || d('newFeature')}</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field title={d('identifier')} value={feature.key} onChange={key => changeFeature(index, { key })} />
            <SimpleSelect ariaLabel={d('operation')} value={feature.operation} options={editor.operations.map(value => ({ value, label: t(`operations.${value}`, { defaultValue: value }) }))} onChange={value => changeFeature(index, { operation: String(value) })} />
            <Field title={d('nameZh')} value={feature.zh} onChange={zh => changeFeature(index, { zh })} />
            <Field title={d('nameEn')} value={feature.en} onChange={en => changeFeature(index, { en })} />
            <Field title={d('permissionResource')} value={feature.permissionResource ?? ''} onChange={permissionResource => changeFeature(index, { permissionResource })} />
            <Field title={d('menuKey')} value={(feature.entryKeys ?? []).join('\n')} multiline onChange={value => changeFeature(index, { entryKeys: lines(value) })} />
            <Field title={d('buttons')} value={feature.buttons.join('\n')} multiline onChange={value => changeFeature(index, { buttons: lines(value) })} />
            <Field title={d('grpc')} value={feature.grpc.join('\n')} multiline onChange={value => changeFeature(index, { grpc: lines(value) })} />
          </div>
          <div className="my-3 space-y-2"><h4>{d('http')}</h4>{feature.http.map((endpoint, endpointIndex) => <div key={endpointIndex} className="flex items-end gap-2"><SimpleSelect ariaLabel={d('method')} value={endpoint.method} options={['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(value => ({value,label:value}))} onChange={value => changeFeature(index, { http: feature.http.map((item, i) => i === endpointIndex ? { ...item, method: String(value) } : item) })} /><Field title={d('path')} value={endpoint.path} onChange={path => changeFeature(index, { http: feature.http.map((item, i) => i === endpointIndex ? { ...item, path } : item) })} /><AButton danger onClick={() => changeFeature(index, { http: feature.http.filter((_, i) => i !== endpointIndex) })}>{d('remove')}</AButton></div>)}<AButton onClick={() => changeFeature(index, { http: [...feature.http, { method: 'GET', path: '/' }] })}>{d('addEndpoint')}</AButton></div>
          <AButton danger onClick={() => update({ features: editor.features.filter((_, i) => i !== index) })}>{d('remove')}</AButton>
        </details>)}
        <AButton disabled={!editor.operations.length} onClick={() => update({ features: [...editor.features, { key: `${editor.key}:`, zh: '', en: '', operation: editor.operations[0], buttons: [], http: [], grpc: [] }] })}>{d('addFeature')}</AButton>
      </section></>}
    </>}
    {editor.nodeKind === 'directory' && <section className="space-y-2"><h3 className="font-semibold">{d('references')}</h3>{Object.entries(catalog.resource_catalog.resources).filter(([key]) => editor.references.includes(key) || canReferenceResource(catalog.resource_catalog, editor.key, key)).map(([key]) => <div key={key} className="rounded border border-gray-200 p-3 dark:border-gray-700"><label className="flex gap-2"><input type="checkbox" checked={editor.references.includes(key)} onChange={event => update({ references: event.target.checked ? [...editor.references, key] : editor.references.filter(value => value !== key), referenceOperations: { ...editor.referenceOperations, [key]: availableReferenceOperations(catalog.resource_catalog, key) } })} />{key}</label>{editor.references.includes(key) && <div className="mt-2 flex gap-3">{availableReferenceOperations(catalog.resource_catalog, key).map(operation => <label key={operation} className="flex gap-2"><input type="checkbox" checked={editor.referenceOperations?.[key]?.includes(operation) ?? false} onChange={event => update({ referenceOperations: { ...editor.referenceOperations, [key]: event.target.checked ? [...(editor.referenceOperations?.[key] ?? []), operation] : (editor.referenceOperations?.[key] ?? []).filter(value => value !== operation) } })} />{t(`operations.${operation}`, {defaultValue: operation})}</label>)}</div>}</div>)}</section>}
  </fieldset>;
}

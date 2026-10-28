'use client';
import { permissionResult } from '@/features/permissions/permission-result';
import { useCatalogLabels } from '@/features/permissions/catalog-context';
import type { ActionConfig } from '@/features/permissions/types';
import { type ReactNode } from 'react';
import { AButton, ACheck, useAdminText, panelClass, mutedClass } from './admin-ui';
import {
  type AdminRecord,
  type AdminResource,
  recordName,
  adminJsonType,
  adminJsonStructure,
  countMembers,
  previewMembers,
  permissionRecords,
  adminDate
} from '@/features/admin/model';
export default function ResourceCards({
  resource,
  records,
  loading,
  selected,
  onSelect,
  onDetail,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  canSelect,
  renderValue
}: {
  resource: AdminResource;
  records: AdminRecord[];
  loading: boolean;
  selected: number[];
  onSelect: (id: number) => void;
  onDetail?: (record: AdminRecord) => void;
  onEdit?: (record: AdminRecord) => void;
  onDelete?: (id: number) => void;
  canEdit?: (record: AdminRecord) => boolean;
  canDelete?: (record: AdminRecord) => boolean;
  canSelect?: (record: AdminRecord) => boolean;
  renderValue: (key: string, value: unknown, record: AdminRecord) => ReactNode;
}) {
  const text = useAdminText();
  const { label } = useCatalogLabels();
  if (loading)
    return (
      <div aria-busy='true' className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {[1, 2, 3, 4, 5, 6].map((id) => (
          <div key={id} className={panelClass}>
            <div className='h-5 w-1/2 animate-pulse rounded bg-muted' />
            <div className='mt-4 h-24 animate-pulse rounded bg-muted' />
          </div>
        ))}
      </div>
    );
  if (!records.length) return <div className={panelClass}>{text('system-insights.empty')}</div>;
  const selectable = records.filter((record) => !canSelect || canSelect(record));
  return (
    <div
      data-testid='resource-cards'
      className='grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3'
    >
      <div className='col-span-full flex flex-wrap items-center gap-3'>
        <ACheck
          label={text('system-insights.selectAllPage')}
          checked={selectable.length > 0 && selectable.every((record) => selected.includes(record.id))}
          disabled={!selectable.length}
          onChange={(checked) => {
            for (const record of selectable)
              if (selected.includes(record.id) !== checked) onSelect(record.id);
          }}
        />
        <span className='text-sm'>{text('system-insights.selectAllPage')}</span>
        {selected.length > 0 && (
          <span className='ms-auto text-sm'>
            {text('system-insights.selected', { count: selected.length })}
          </span>
        )}
      </div>
      {records.map((record) => (
        <article key={record.id} className={panelClass}>
          <div className='flex items-start justify-between gap-2'>
            {onDetail ? <button
              type='button'
              className='min-w-0 break-words text-start font-semibold hover:underline'
              onClick={() => onDetail(record)}
            >
              {recordName(record)}
            </button> : <strong className='min-w-0 break-words'>{recordName(record)}</strong>}
            <ACheck
              label={text('system-cards.select', { name: recordName(record) })}
              checked={selected.includes(record.id)}
              disabled={!!canSelect && !canSelect(record)}
              onChange={() => { if (!canSelect || canSelect(record)) onSelect(record.id); }}
            />
          </div>
          <p className={mutedClass}>
            {String(record.word ?? record.code ?? record.key ?? `#${record.id}`)}
          </p>
          <div className='my-4 min-h-20 space-y-2 break-words text-sm'>
            {resource === 'dictionary' && (
              <>
                {renderValue('enabled', record.enabled, record)}
                <div className='flex gap-2 text-xs opacity-70'>
                  <span className='rounded border px-2 py-1'>
                    {text(`system-cards.types.${adminJsonType(record.value)}`)}
                  </span>
                  <span>
                    {text(`system-cards.${adminJsonStructure(record.value).key}`, {
                      count: adminJsonStructure(record.value).count
                    })}
                  </span>
                </div>
                <div
                  data-testid='json-scroll'
                  role='textbox'
                  aria-readonly='true'
                  aria-multiline='true'
                  aria-label={text('system.fields.dictionaryValue')}
                  tabIndex={0}
                  className='max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs'
                >
                  <pre className='whitespace-pre-wrap break-words'>
                    {JSON.stringify(record.value, null, 2)}
                  </pre>
                </div>
                <p>{String(record.description || text('system-cards.noDescription'))}</p>
              </>
            )}
            {resource === 'whitelist' && (
              <>
                {renderValue('category', record.category, record)}
                {renderValue('resource', record.resource, record)}
              </>
            )}
            {resource === 'action' &&
              (() => {
                const result = permissionResult(record.config as ActionConfig | undefined);
                return (
                  <>
                    <p>
                      {result.all
                        ? text('permission-display.allResources')
                        : result.resources.map((key) => label('resources', key)).join(', ') || '—'}
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {result.operations.map((operation) => (
                        <span className='rounded border px-2 py-1 text-xs' key={operation}>
                          {label('operations', operation)}
                        </span>
                      ))}
                    </div>
                    <div className='flex flex-wrap gap-1'>
                      {result.features.map((feature) => (
                        <span className='rounded border px-2 py-1 text-xs' key={feature}>
                          {label('features', feature)}
                        </span>
                      ))}
                    </div>
                  </>
                );
              })()}
            {(resource === 'role' || resource === 'user' || resource === 'user-group') && (
              <>
                <p>
                  {text('system-cards.associatedPermissions')}: {permissionRecords(record).length}
                </p>
                <div className='flex flex-wrap gap-1'>
                  {permissionRecords(record).slice(0, 3).map((action) => (
                    <span key={String(action.code)} className='rounded border px-2 py-1 text-xs text-blue-600'>{String(action.name || action.code)}</span>
                  ))}
                </div>
                <div className='flex flex-wrap gap-1'>
                  {[...new Set(permissionRecords(record).map((action) => String(action.group)))]
                    .slice(0, 4)
                    .map((group) => (
                      <span className='rounded border px-2 py-1 text-xs' key={group}>
                        {group ? label('groups', group) : text('system-insights.ungrouped')}
                      </span>
                    ))}
                </div>
              </>
            )}
            {resource === 'user-group' && (
              <>
                <p>{text('system-members.count', { count: countMembers(record) })}</p>
                <div className='flex flex-wrap gap-1'>
                  {previewMembers(record)
                    .slice(0, 5)
                    .map((member) => (
                      <span key={member.id} className='rounded border px-2 py-1 text-xs'>
                        {recordName(member)}
                      </span>
                    ))}
                </div>
              </>
            )}
            {resource === 'user' && (
              <>
                {renderValue('status', record.status, record)}
                <p>
                  {text('system-cards.loginCount')}: {Number(record.login_count ?? 0)}
                </p>
              </>
            )}
          </div>
          <div className='flex flex-wrap items-center gap-2 border-t pt-3'>
            {onDetail && <AButton onClick={() => onDetail(record)}>{text('system-cards.details')}</AButton>}
            {onEdit && (!canEdit || canEdit(record)) && (
              <AButton onClick={() => onEdit(record)}>{text('system.common.edit')}</AButton>
            )}
            {onDelete && (!canDelete || canDelete(record)) && (
              <AButton danger onClick={() => onDelete(record.id)}>
                {text('system.common.delete')}
              </AButton>
            )}
          </div>
          <p className='mt-3 text-xs opacity-60'>{adminDate(record.updated_at)}</p>
        </article>
      ))}
    </div>
  );
}

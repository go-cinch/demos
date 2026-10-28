'use client';
import { groupMemberAccess } from '../management-access';
import PermissionDetail from '@/features/permissions/detail';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AButton,
  AdminDrawer,
  useAdminText,
  useAdminTimezone,
  useAdminIdentity,
  panelClass,
  mutedClass
} from './admin-ui';
import { getAdminRecord, getGroupMembers } from '@/features/admin/service';
import {
  type AdminRecord,
  type AdminResource,
  recordName,
  countMembers,
  permissionRecords,
  adminDate
} from '@/features/admin/model';
export default function RecordDetail({
  resource,
  record,
  onClose,
  onEdit,
  renderValue
}: {
  resource: AdminResource;
  record?: AdminRecord;
  onClose: () => void;
  onEdit?: (record: AdminRecord) => void;
  renderValue: (key: string, value: unknown, record: AdminRecord) => ReactNode;
}) {
  const text = useAdminText();
  const timezone = useAdminTimezone();
  const [data, setData] = useState<AdminRecord>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setData(record);
    if (!record) return;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setLoading(true);
    setError(false);
    getAdminRecord(resource, record.id)
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [record, resource, retry]);
  return (
    <AdminDrawer
      wide={['action', 'role', 'user', 'user-group'].includes(resource)}
      open={!!record}
      title={text('system-cards.recordDetails')}
      onClose={onClose}
      footer={
        <>
          <AButton onClick={onClose}>{text('system-cards.backToList')}</AButton>
          {data && onEdit && (
            <AButton active onClick={() => onEdit(data)}>
              {text('system.common.edit')}
            </AButton>
          )}
        </>
      }
    >
      {loading ? (
        <div aria-busy='true' className='h-64 animate-pulse rounded bg-muted' />
      ) : error ? (
        <div role='alert'>
          {text('system-cards.loadError')}
          <AButton onClick={() => setRetry((value) => value + 1)}>
            {text('system-cards.retry')}
          </AButton>
        </div>
      ) : (
        data && (
          <div className='space-y-5' data-testid='record-detail'>
            <div>
              <h3 className='text-xl font-semibold'>{recordName(data)}</h3>
              <span className={mutedClass}>#{data.id}</span>
            </div>
            <dl className='grid gap-3 sm:grid-cols-2'>
              {Object.entries(data)
                .filter(
                  ([key]) =>
                    ![
                      'id',
                      'actions',
                      'action_codes',
                      'users',
                      'member_count',
                      'member_preview',
                      'permission_sources',
                      'config',
                      'names',
                      'role_summary'
                    ].includes(key)
                )
                .map(([key, value]) => (
                  <div key={key} className='min-w-0 rounded-lg border p-3'>
                    <dt className={mutedClass}>{text(fieldKey(key))}</dt>
                    <dd className='mt-2 break-words'>
                      {key.endsWith('_at') ? (
                        adminDate(value, timezone)
                      ) : ['value', 'metadata'].includes(key) ? (
                        <div
                          data-testid='json-scroll'
                          role='textbox'
                          aria-readonly='true'
                          aria-multiline='true'
                          aria-label={text(
                            key === 'metadata'
                              ? 'system.fields.metadata'
                              : 'system.fields.dictionaryValue'
                          )}
                          tabIndex={0}
                          className='max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs'
                        >
                          <pre className='whitespace-pre-wrap break-words'>
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        renderValue(key, value, data)
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
            {['action', 'role', 'user', 'user-group'].includes(resource) && (
              <PermissionDetail record={data} />
            )}
            {resource === 'user-group' && <MemberList id={data.id} count={countMembers(data)} />}
            <details>
              <summary className='cursor-pointer'>{text('system-cards.rawRecord')}</summary>
              <pre className='mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs'>
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </div>
        )
      )}
    </AdminDrawer>
  );
}
const fields: Record<string, string> = {
  username: 'username',
  code: 'code',
  name: 'name',
  word: 'word',
  group: 'group',
  key: 'dictionaryKey',
  value: 'dictionaryValue',
  enabled: 'enabled',
  description: 'description',
  resource: 'resourceRules',
  menu: 'menuPaths',
  button: 'buttonPermission',
  status: 'status',
  metadata: 'metadata',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  role: 'role',
  role_id: 'role'
};
function fieldKey(key: string) {
  return key === 'login_count'
    ? 'system-cards.loginCount'
    : key === 'last_logged_in_at'
      ? 'system-cards.lastLogin'
      : key === 'wrong'
        ? 'system-cards.failedLoginCount'
        : `system.fields.${fields[key] ?? key}`;
}
export function PermissionPreview({ record }: { record: AdminRecord }) {
  const text = useAdminText();
  const actions = permissionRecords(record);
  const [group, setGroup] = useState<string>();
  const codes = Array.isArray(record.action_codes) ? record.action_codes.map(String) : [];
  const unresolved = codes.filter(
    (code) => !actions.some((action) => String(action.code) === code)
  );
  return (
    <section aria-label={text('system-cards.associatedPermissions')} className='space-y-3'>
      <h3 className='font-semibold'>{text('system-cards.associatedPermissions')}</h3>
      <div className='flex flex-wrap gap-2'>
        <AButton active={group === undefined} onClick={() => setGroup(undefined)}>
          {text('system-insights.all')}
        </AButton>
        {[...new Set(actions.map((action) => String(action.group ?? '')))].map((value) => (
          <AButton key={value} active={group === value} onClick={() => setGroup(value)}>
            {value || text('system-insights.ungrouped')}
          </AButton>
        ))}
      </div>
      {!actions.length && <p className={mutedClass}>{text('system-cards.noPermissions')}</p>}
      {actions
        .filter((action) => group === undefined || String(action.group ?? '') === group)
        .map((action) => (
          <div key={action.id} className={panelClass}>
            <div className='flex flex-wrap justify-between gap-2'>
              <strong>{recordName(action)}</strong>
              <code>{String(action.code)}</code>
            </div>
            <p className={mutedClass}>{String(action.word ?? '')}</p>
            {['resource', 'menu', 'button'].map((key) => (
              <div key={key} className='mt-2 flex flex-wrap gap-1'>
                {String(action[key] ?? '')
                  .split(/\r?\n/)
                  .filter(Boolean)
                  .map((rule) => (
                    <span
                      key={rule}
                      className='max-w-full break-words rounded border px-2 py-1 font-mono text-xs'
                    >
                      {rule}
                    </span>
                  ))}
              </div>
            ))}
          </div>
        ))}
      {!!unresolved.length && (
        <div role='status' className='rounded border border-amber-500/40 p-3'>
          <strong>{text('system-cards.unresolvedPermissions')}</strong>
          <p className={mutedClass}>{text('system-cards.unresolvedHint')}</p>
          {unresolved.map((code) => (
            <code className='me-2' key={code}>
              {code}
            </code>
          ))}
        </div>
      )}
    </section>
  );
}
export function MemberList({
  id,
  count,
  removed = [],
  disabled = false,
  onRemove
}: {
  id: number;
  count: number;
  removed?: number[];
  disabled?: boolean;
  onRemove?: (member: AdminRecord) => void;
}) {
  const text = useAdminText();
  const access = groupMemberAccess(useAdminIdentity());
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(count);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!access.view) return;
    // oxlint-disable-next-line react/set-state-in-effect -- Reset the request state before starting this external query.
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      getGroupMembers(id, { p: page, s: 20, q: query.trim() })
        .then((value) => {
          if (active) {
            setRows(value.items);
            setTotal(value.t);
          }
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, page, query, retry, access.view]);
  if (!access.view) return null;
  return (
    <section
      aria-label={text('system-editor.members')}
      className='space-y-3'
      data-testid='group-members'
    >
      <h3 className='font-semibold'>{text('system-members.count', { count: total })}</h3>
      <input
        className='w-full rounded-lg border bg-transparent p-2'
        aria-label={text('system-editor.searchMember')}
        placeholder={text('system-editor.searchMember')}
        value={query}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      {error ? (
        <div role='alert'>
          {text('system-cards.loadError')}
          <AButton disabled={disabled} onClick={() => { if (!disabled && access.view) setRetry((value) => value + 1); }}>
            {text('system-cards.retry')}
          </AButton>
        </div>
      ) : (
        <div aria-busy={loading} className='min-h-24 space-y-2'>
          {rows.map((member) => (
            <div
              key={member.id}
              className='flex items-center justify-between gap-2 rounded-lg border p-3'
            >
              <span className={removed.includes(member.id) ? 'line-through opacity-50' : ''}>
                {recordName(member)} · {String(member.code ?? '')}
              </span>
              {onRemove && access.remove && (
                <AButton
                  ariaLabel={text(
                    removed.includes(member.id) ? 'system-editor.undo' : 'system-editor.removeItem',
                    { name: recordName(member) }
                  )}
                  disabled={disabled}
                  onClick={() => { if (!disabled && access.remove) onRemove(member); }}
                >
                  {text(
                    removed.includes(member.id) ? 'system-editor.undo' : 'system-members.remove'
                  )}
                </AButton>
              )}
            </div>
          ))}
          {!loading && !rows.length && <p>{text('system-cards.noMembers')}</p>}
        </div>
      )}
      <div className='flex justify-between gap-2'>
        <AButton disabled={disabled || loading || page === 1} onClick={() => setPage((value) => value - 1)}>
          {text('system.common.previous')}
        </AButton>
        <span>
          {page} / {Math.max(1, Math.ceil(total / 20))}
        </span>
        <AButton
          disabled={disabled || loading || page * 20 >= total}
          onClick={() => setPage((value) => value + 1)}
        >
          {text('system.common.next')}
        </AButton>
      </div>
    </section>
  );
}

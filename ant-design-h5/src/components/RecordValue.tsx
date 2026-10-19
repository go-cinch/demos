import { Link } from 'react-router-dom';
import { Tag } from 'antd-mobile';
import type { RecordData } from '../lib/types';
import type { DisplayColumn } from '../lib/resource-config';
import { dateTime } from '../lib/format';
import { t } from '../locales';
export default function RecordValue({
  record: r,
  column: c,
  showLockExpiration = true,
}: {
  record: RecordData;
  column: DisplayColumn;
  showLockExpiration?: boolean;
}) {
  const v = r[c.dataIndex];
  if (c.display === 'date') return <time>{dateTime(v)}</time>;
  if (c.display === 'json')
    return <pre className="json-value">{JSON.stringify(v ?? null, null, 2)}</pre>;
  if (c.display === 'status')
    return (
      <span className="status-value">
        <Tag color={v === 0 ? 'warning' : v === 1 ? 'success' : 'danger'} fill="outline">
          {t(
            v === 0
              ? 'system.status.pending'
              : v === 1
                ? 'system.status.active'
                : 'system.status.locked',
          )}
        </Tag>
        {showLockExpiration && v === 2 && r.metadata?.lock_expired_at !== undefined && (
          <span className={`resource-tag ${r.metadata.lock_expired_at === 0 ? 'red' : 'orange'}`}>
            {r.metadata.lock_expired_at === 0
              ? t('system.user.permanent')
              : dateTime(r.metadata.lock_expired_at)}
          </span>
        )}
        {v === 0 && !!r.metadata?.reject_register_reason && (
          <small className="field-error">{String(r.metadata.reject_register_reason)}</small>
        )}
      </span>
    );
  if (c.display === 'boolean')
    return (
      <Tag color={v ? 'success' : 'default'} fill="outline">
        {t(v ? 'system.enabled.yes' : 'system.enabled.no')}
      </Tag>
    );
  if (c.display === 'category')
    return (
      <span className={`resource-tag ${v === 0 ? 'blue' : 'green'}`}>
        {t(v === 0 ? 'system.category.permission' : 'system.category.jwt')}
      </span>
    );
  if (c.display === 'role')
    return r.role ? (
      <Link to={`/system/role?word=${encodeURIComponent(r.role.word)}`}>{r.role.name}</Link>
    ) : (
      <>—</>
    );
  if (c.display === 'actions')
    return (
      <div className="tags">
        {r.action_codes?.map((code) => (
          <Link
            className="resource-tag blue"
            key={code}
            to={`/system/action?code=${encodeURIComponent(r.action_codes!.join(','))}`}
          >
            {code}
          </Link>
        ))}
        {!r.action_codes?.length && '—'}
      </div>
    );
  if (c.display === 'users')
    return (
      <div className="tags">
        {r.users?.map((u) => (
          <Link
            className="resource-tag"
            key={u.id}
            to={`/system/user?username=${encodeURIComponent(u.username)}`}
          >
            {u.username}
          </Link>
        ))}
        {!r.users?.length && '—'}
      </div>
    );
  if (c.display === 'resource-rules' || ['menu', 'button'].includes(c.key))
    return (
      <div className="tags">
        {String(v || '')
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line, i) => (
            <span
              key={i}
              className={`resource-tag ${typeof r.category === 'number' ? (r.category === 0 ? 'blue' : 'green') : ({ GET: 'green', POST: 'blue', PATCH: 'orange', DELETE: 'red' } as Record<string, string>)[line.split('|')[0]?.trim().toUpperCase()] || ''}`}
            >
              {line}
            </span>
          ))}
      </div>
    );
  return <span>{v === null || v === undefined || v === '' ? '—' : String(v)}</span>;
}

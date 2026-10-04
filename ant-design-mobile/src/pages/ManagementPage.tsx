import ResultToolbar from '../components/ResultToolbar';
import RecordPagination from '../components/RecordPagination';
import ResultOptions from '../components/ResultOptions';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Checkbox } from 'antd-mobile';
import { can, listResource } from '../lib/api';
import { configs } from '../lib/resource-config';
import { initials, labelFor } from '../lib/format';
import type { RecordData, ResourceKind } from '../lib/types';
import { t } from '../locales';
import { Icon, IconButton, Sheet, ErrorBox, NoData } from '../components/UI';
import PageSkeleton from '../components/PageSkeleton';
import SearchField from '../components/SearchField';
import RecordEditor from '../components/RecordEditor';
import RecordOperation from '../components/RecordOperation';
import RecordValue from '../components/RecordValue';
import { parseFilters } from '../lib/filters';
import { defaultColumns, identityColumn } from '../lib/resource-presentation';
export default function ManagementPage({ resource }: { resource: ResourceKind }) {
  const config = configs.value[resource],
    location = useLocation();
  const primary =
    config.filters.find((x) => x.type === 'input') ||
    config.filters.find((x) => x.key === 'resource') ||
    config.filters[0];
  const [records, setRecords] = useState<RecordData[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [size, setSize] = useState(20),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [filters, setFilters] = useState<Record<string, unknown>>(() =>
      parseFilters(location.search, config.filters),
    ),
    [applied, setApplied] = useState(filters),
    [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState<number[]>([]),
    [selecting, setSelecting] = useState(false),
    [record, setRecord] = useState<RecordData | null>(null),
    [detail, setDetail] = useState(false),
    [editor, setEditor] = useState(false),
    [options, setOptions] = useState(''),
    [density, setDensity] = useState('default'),
    [filterVersion, setFilterVersion] = useState(0),
    [columns, setColumns] = useState([...defaultColumns[resource]]),
    [bordered, setBordered] = useState(false),
    [striped, setStriped] = useState(false),
    [sticky, setSticky] = useState(true),
    [operation, setOperation] = useState(''),
    [deletion, setDeletion] = useState<number[]>([]),
    [revision, setRevision] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(),
    filterRef = useRef(filters);
  filterRef.current = filters;
  const resultTop = useRef<HTMLDivElement>(null);
  const scrollToResults = useRef(false);
  const readable = can(resource, 'read');
  const promotedFilterKeys = new Set([primary.key, ...(resource === 'user' ? ['status'] : [])]);
  const additionalFilters = config.filters.filter((f) => !promotedFilterKeys.has(f.key));
  useEffect(() => {
    setFilters(parseFilters(location.search, config.filters));
    setApplied(parseFilters(location.search, config.filters));
    setPage(1);
  }, [location.search]);
  useEffect(() => {
    if (!readable) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    listResource(resource, { ...applied, p: page, s: size })
      .then((result) => {
        if (cancelled) return;
        if (!result.items.length && result.t > 0 && page > 1) {
          setPage((p) => p - 1);
          return;
        }
        setRecords(result.items);
        if (scrollToResults.current) {
          scrollToResults.current = false;
          requestAnimationFrame(() =>
            resultTop.current?.scrollIntoView({ block: 'start', behavior: 'instant' }),
          );
        }
        setTotal(result.t);
        setSelected([]);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resource, applied, page, size, revision, readable]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function search() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setApplied({ ...filterRef.current });
      setPage(1);
    }, 100);
  }
  function changeFilter(key: string, v: unknown) {
    const next = { ...filterRef.current, [key]: v };
    filterRef.current = next;
    setFilters(next);
  }
  function openEditor(r: RecordData | null) {
    if (!can(resource, r ? 'update' : 'create')) return;
    setRecord(r);
    setDetail(false);
    setEditor(true);
  }
  function saved() {
    setNotice(t('system.messages.updated'));
    setDetail(false);
    setRevision((v) => v + 1);
  }
  function remove(ids: number[], r: RecordData | null) {
    setRecord(r);
    setDeletion(ids);
    setOperation('delete');
  }
  const status = Array.isArray(filters.status)
    ? String(filters.status[0])
    : String(filters.status ?? 'all');
  return (
    <section
      className={`page management density-${density} ${bordered ? 'bordered' : ''} ${striped ? 'striped' : ''} ${sticky ? 'sticky-toolbar' : ''}`}
      aria-busy={loading}
    >
      <header className="page-heading">
        <Link to="/dashboard/overview?tab=manage" className="back-link">
          <Icon name="chevron-left" size={16} />
          <span className="sr-only">{t('manage')}</span>
        </Link>

        <div>
          <h1>{config.title}</h1>
        </div>
        <Icon
          name={
            resource === 'user'
              ? 'usergroup'
              : resource === 'role'
                ? 'secured'
                : resource === 'dictionary'
                  ? 'book'
                  : 'app'
          }
          size={28}
        />
      </header>
      {readable ? (
        <>
          <section className="search-region">
            <SearchField
              key={`${resource}-${primary.key}-${filterVersion}`}
              resource={resource}
              field={primary}
              value={filters[primary.key]}
              onChange={(v) => changeFilter(primary.key, v)}
              onSearch={search}
            />
            {resource === 'user' && (
              <div className="segmented">
                {['all', '1', '0', '2'].map((value) => (
                  <button
                    key={value}
                    className={status === value ? 'active' : ''}
                    onClick={() => {
                      changeFilter('status', value === 'all' ? undefined : [Number(value)]);
                      search();
                    }}
                  >
                    {t(
                      value === 'all'
                        ? 'all'
                        : value === '1'
                          ? 'system.status.active'
                          : value === '0'
                            ? 'system.status.pending'
                            : 'system.status.locked',
                    )}
                  </button>
                ))}
              </div>
            )}
            {expanded && (
              <div className="advanced-filters">
                {additionalFilters.map((f) => (
                  <SearchField
                    key={`${f.key}-${filterVersion}`}
                    resource={resource}
                    field={f}
                    value={filters[f.key]}
                    onChange={(v) => changeFilter(f.key, v)}
                    onSearch={search}
                  />
                ))}
              </div>
            )}
            <div className="search-actions">
              <button
                className="search-toggle"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                {t(expanded ? 'system.common.less' : 'system.common.more')}
              </button>
              <button
                className="search-reset"
                onClick={() => {
                  filterRef.current = {};
                  setFilters({});
                  setFilterVersion((v) => v + 1);
                  clearTimeout(timer.current);
                  setApplied({});
                  setPage(1);
                }}
              >
                <Icon name="refresh" size={14} />
                <span>{t('system.common.reset')}</span>
              </button>
              <button className="search-submit" onClick={search}>
                <Icon name="search" size={14} />
                <span>{t('system.common.search')}</span>
              </button>
            </div>
          </section>
          {!expanded &&
            Object.entries(applied).some(
              ([key, value]) =>
                !promotedFilterKeys.has(key) && value !== undefined && String(value) !== '',
            ) && (
              <div className="applied-filters" aria-label={t('appliedFilters')}>
                {config.filters
                  .filter(
                    (f) =>
                      !promotedFilterKeys.has(f.key) &&
                      applied[f.key] !== undefined &&
                      String(applied[f.key]) !== '',
                  )
                  .map((f) => {
                    const value = applied[f.key];
                    const values = Array.isArray(value) ? value : [value];
                    const labels = values.map((v) =>
                      f.type.includes('status')
                        ? t(
                            `system.status.${Number(v) === 0 ? 'pending' : Number(v) === 1 ? 'active' : 'locked'}`,
                          )
                        : f.type === 'category'
                          ? t(`system.category.${Number(v) === 0 ? 'permission' : 'jwt'}`)
                          : f.type === 'enabled'
                            ? t(`system.enabled.${String(v) === 'true' ? 'yes' : 'no'}`)
                            : String(v),
                    );
                    return (
                      <button
                        key={f.key}
                        className="resource-tag"
                        aria-label={`${t('clear')} ${f.label}`}
                        onClick={() => {
                          changeFilter(f.key, undefined);
                          search();
                          setFilterVersion((v) => v + 1);
                        }}
                      >
                        {f.label}: {labels.join(' / ')}
                        <Icon name="close" size={14} />
                      </button>
                    );
                  })}
              </div>
            )}
          <div ref={resultTop} className="result-anchor" aria-hidden="true" />
          <div className="results-region">
            <ResultToolbar refresh={() => setRevision((v) => v + 1)} options={setOptions}>
              {can(resource, 'create') && (
                <Button
                  className="create-record"
                  aria-label={t('system.common.create')}
                  size="small"
                  color="primary"
                  onClick={() => openEditor(null)}
                >
                  <Icon name="add" size={16} />
                  <span className="create-label">{t('system.common.create')}</span>
                </Button>
              )}
            </ResultToolbar>
            <div className="selection-tools">
              <div className="selection-actions">
                {can(resource, 'delete') && records.length > 0 && (
                  <button
                    className="action-chip action-chip-quiet"
                    onClick={() => {
                      setSelecting((v) => !v);
                      setSelected([]);
                    }}
                  >
                    <Icon name={selecting ? 'check' : 'check-rectangle'} size={16} />
                    <span>{t(selecting ? 'done' : 'select')}</span>
                  </button>
                )}
                {selecting && (
                  <>
                    <button
                      className="action-chip action-chip-quiet"
                      onClick={() =>
                        setSelected(
                          selected.length === records.length ? [] : records.map((r) => r.id),
                        )
                      }
                    >
                      <Icon name="check-double" size={16} />
                      <span>{t('system.common.selectAll')}</span>
                    </button>
                    <small className="selected-count">
                      {t('selected', { count: selected.length })}
                    </small>
                  </>
                )}
                {selected.length > 0 && can(resource, 'delete') && (
                  <button
                    className="action-chip action-chip-danger"
                    onClick={() => remove([...selected], null)}
                  >
                    <Icon name="delete" size={16} />
                    <span>{t('system.common.deleteSelected')}</span>
                  </button>
                )}
              </div>
              <span className="result-count">{t('system.table.total', { count: total })}</span>
            </div>
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <ErrorBox error={error} retry={() => setRevision((v) => v + 1)} />
            {loading ? (
              <PageSkeleton variant="list" />
            ) : records.length ? (
              <div className="card record-list">
                {records.map((r) => (
                  <article className="record-item" data-record-id={r.id} key={r.id}>
                    <div className="record">
                      {selecting && (
                        <Checkbox
                          aria-label={`${t('select')} ${labelFor(r)}`}
                          checked={selected.includes(r.id)}
                          onChange={(checked) =>
                            setSelected((s) =>
                              checked ? [...s, r.id] : s.filter((x) => x !== r.id),
                            )
                          }
                        />
                      )}
                      <button
                        className="record-open"
                        onClick={() => {
                          setRecord(r);
                          setDetail(true);
                        }}
                        aria-label={`${t('view')} ${labelFor(r)}`}
                      >
                        <span className="record-kind">
                          <Icon
                            name={
                              resource === 'user'
                                ? 'user'
                                : resource === 'role'
                                  ? 'secured'
                                  : resource === 'action'
                                    ? 'key'
                                    : resource === 'dictionary'
                                      ? 'book'
                                      : resource === 'whitelist'
                                        ? 'check-rectangle'
                                        : 'usergroup'
                            }
                            size={20}
                          />
                        </span>
                        <span className="record-main">
                          <strong>{labelFor(r)}</strong>
                          <small>
                            {String(
                              r.metadata?.department ||
                                r.role?.name ||
                                r.word ||
                                r.key ||
                                r.code ||
                                `#${r.id}`,
                            )}
                          </small>
                          {(resource === 'role' || resource === 'user-group') && (
                            <small className="record-summary">
                              {resource === 'user-group' &&
                                `${t('memberCount', { count: r.users?.length || 0 })} · `}
                              {t('permissionCount', { count: r.action_codes?.length || 0 })}
                            </small>
                          )}
                          {resource === 'action' && (
                            <small className="record-summary">
                              {String(r.group || '—')} ·{' '}
                              {t('ruleCount', {
                                count: String(r.resource || '')
                                  .split(/\r?\n/)
                                  .filter(Boolean).length,
                              })}
                            </small>
                          )}
                          {resource === 'whitelist' && (
                            <RecordValue
                              record={r}
                              column={{
                                key: 'category',
                                dataIndex: 'category',
                                title: '',
                                display: 'category',
                              }}
                            />
                          )}
                        </span>
                        {r.status !== undefined && (
                          <span className="record-status">
                            <RecordValue
                              record={r}
                              showLockExpiration={false}
                              column={{
                                dataIndex: 'status',
                                key: 'status',
                                title: '',
                                display: 'status',
                              }}
                            />
                          </span>
                        )}
                        {r.enabled !== undefined && (
                          <RecordValue
                            record={r}
                            column={{
                              dataIndex: 'enabled',
                              key: 'enabled',
                              title: '',
                              display: 'boolean',
                            }}
                          />
                        )}
                        <Icon name="chevron-right" size={16} />
                      </button>
                    </div>
                    {columns.some(
                      (key) =>
                        ![
                          identityColumn[resource],
                          ...(resource === 'user'
                            ? ['role', 'status']
                            : resource === 'role'
                              ? ['word', 'action_codes']
                              : resource === 'user-group'
                                ? ['word', 'users', 'action_codes']
                                : resource === 'action'
                                  ? ['word']
                                  : resource === 'dictionary'
                                    ? ['key', 'enabled']
                                    : []),
                        ].includes(key),
                    ) && (
                      <dl className="record-fields">
                        {config.columns
                          .filter(
                            (c) =>
                              columns.includes(c.key) &&
                              c.key !== identityColumn[resource] &&
                              !(
                                resource === 'user'
                                  ? ['role', 'status']
                                  : resource === 'role'
                                    ? ['word', 'action_codes']
                                    : resource === 'user-group'
                                      ? ['word', 'users', 'action_codes']
                                      : resource === 'action'
                                        ? ['word']
                                        : resource === 'dictionary'
                                          ? ['key', 'enabled']
                                          : []
                              ).includes(c.key),
                          )
                          .map((c) => (
                            <div key={c.key}>
                              <dt>{c.title}</dt>
                              <dd>
                                <RecordValue record={r} column={c} />
                              </dd>
                            </div>
                          ))}
                      </dl>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <NoData text={t('noResults')} />
            )}
            <RecordPagination
              page={page}
              size={size}
              total={total}
              loading={loading}
              change={(value) => {
                scrollToResults.current = true;
                setPage(value);
              }}
              options={() => setOptions('pageSize')}
            />
          </div>
        </>
      ) : (
        <NoData text={t('noAccess')} />
      )}
      <Sheet
        open={detail}
        onClose={() => setDetail(false)}
        title={`${config.entity} · ${t('detail')}`}
        footer={
          record ? (
            <div className="detail-actions">
              {can(resource, 'update') && (
                <Button color="primary" onClick={() => openEditor(record)}>
                  {t('system.common.edit')}
                </Button>
              )}
              {resource === 'user' && can(resource, 'update') && (
                <>
                  <Button
                    onClick={() =>
                      setOperation(
                        record.status === 0 ? 'review' : record.status === 1 ? 'lock' : 'unlock',
                      )
                    }
                  >
                    {t(
                      `system.user.${record.status === 0 ? 'review' : record.status === 1 ? 'lock' : 'unlock'}`,
                    )}
                  </Button>
                  {Number(record.metadata?.password_change_failures) > 0 && (
                    <Button onClick={() => setOperation('unlockPassword')}>
                      {t('system.user.unlockPassword')}
                    </Button>
                  )}
                </>
              )}
              {can(resource, 'delete') && (
                <Button color="danger" fill="outline" onClick={() => remove([record.id], record)}>
                  {t('system.common.delete')}
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {record && (
          <>
            <div className="detail-identity">
              <span className="avatar large">{initials(labelFor(record))}</span>
              <h2>{labelFor(record)}</h2>
            </div>
            <dl className="details">
              {config.columns.map((c) => (
                <div
                  className={[
                    c.display === 'json' ||
                    c.display === 'actions' ||
                    c.display === 'users' ||
                    c.display === 'resource-rules' ||
                    ['menu', 'button'].includes(c.key)
                      ? 'detail-wide'
                      : '',
                    c.display === 'status' ? 'detail-status' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={c.key}
                >
                  <dt>{c.title}</dt>
                  <dd>
                    <RecordValue record={record} column={c} />
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Sheet>
      {editor && (
        <RecordEditor
          resource={resource}
          record={record}
          onClose={() => setEditor(false)}
          onSaved={saved}
        />
      )}{' '}
      {operation && (
        <RecordOperation
          operation={operation}
          resource={resource}
          record={record}
          ids={deletion}
          onClose={() => setOperation('')}
          onSaved={saved}
        />
      )}
      <ResultOptions
        options={options}
        setOptions={setOptions}
        density={density}
        setDensity={setDensity}
        size={size}
        setSize={setSize}
        setPage={setPage}
        columns={columns}
        setColumns={setColumns}
        fields={config.columns}
        identity={identityColumn[resource]}
        bordered={bordered}
        setBordered={setBordered}
        striped={striped}
        setStriped={setStriped}
        sticky={sticky}
        setSticky={setSticky}
      />
    </section>
  );
}

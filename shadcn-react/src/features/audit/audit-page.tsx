'use client';
import { auditListFields } from '@/features/admin/field-selectors';
import { useStatisticsWarning } from '@/features/admin/statistics-warning';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { useAudit } from './use-audit';
import AuditTrend from './audit-trend';
import AuditTableTools, { type AuditDensity, type AuditStyle } from './audit-table-tools';
import {
  AButton,
  ASelect,
  AdminDrawer,
  AuditPageFrame,
  useAdminText,
  useAdminTimezone,
  useAuditAccess,
  panelClass,
  mutedClass
} from '@/features/system/components/admin-ui';
import { adminDate, type AuditEvent } from '@/features/admin/model';
export default function AuditPage({ kind }: { kind: 'login' | 'operation' }) {
  const text = useAdminText(),
    timezone = useAdminTimezone(),
    access = useAuditAccess(kind);
  const allColumns = [
    'occurred_at',
    'username',
    'status',
    'ip',
    ...(kind === 'operation' ? ['module', 'path', 'duration_ms'] : ['user_agent'])
  ];
  const [visibleColumns, setVisibleColumns] = useState(kind === 'login' ? allColumns : allColumns.filter((key) => key !== 'ip')),
    [density, setDensity] = useState<AuditDensity>('default'),
    [tableStyle, setTableStyle] = useState<AuditStyle>({
      bordered: false,
      striped: false,
      sticky: true
    });
  const a = useAudit(kind, access.read && access.menu, timezone, access.identity, access.username, auditListFields(kind, visibleColumns), access.export);
  const padding = density === 'compact' ? 'p-1.5' : density === 'loose' ? 'p-5' : 'p-3';
  const [view, setView] = useState<'heat' | 'trend'>('heat'),
    [expanded, setExpanded] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [suggestOpen, setSuggestOpen] = useState(false),
    [exportError, setExportError] = useState(false),
    [exporting, setExporting] = useState(false),
    [copyStatus, setCopyStatus] = useState('');
  const root = useRef<HTMLDivElement>(null),
    heatRoot = useRef<HTMLDivElement>(null),
    wheelAt = useRef(0),
    wheelDelta = useRef(0),
    lastWheelAt = useRef(0);
  useEffect(() => {
    const node = heatRoot.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('button[data-heat-index]')
          : null;
      const cell = button ? a.heatCells[Number(button.dataset.heatIndex)] : a.day;
      if (!cell) return;

      if (
        a.days !== 30 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      )
        return;
      const now = performance.now();
      if (now < wheelAt.current) {
        event.preventDefault();
        return;
      }
      const next = event.deltaY < 0 ? 'hour' : 'day';
      if (next === a.heatLevel) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 312 : 1);
      if (now - lastWheelAt.current > 180 || Math.sign(delta) !== Math.sign(wheelDelta.current))
        wheelDelta.current = 0;
      lastWheelAt.current = now;
      wheelDelta.current += delta;
      if (Math.abs(wheelDelta.current) < 30) return;
      wheelDelta.current = 0;
      wheelAt.current = now + 600;
      if (next === 'hour') {
        a.selectCell(cell, false);
        a.setHeatLevel('hour');
      } else {
        a.setHeatLevel('day');
        if (a.day) a.selectCell(a.day, false);
      }
    };
    // React wheel listeners are passive; this gesture must suppress page scrolling.
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [a, view, kind]);
  const title = text(`audit.${kind}`),
    context = a.scope ? a.insight : a.overview;
  const showOverviewWarning = useStatisticsWarning(a.overviewError);
  const showScopeWarning = useStatisticsWarning(a.scopeError);
  const summary = a.overview;
  const ranks =
    kind === 'login'
      ? [
          {
            key: 'accounts',
            field: 'username' as const,
            title: 'failedAccounts',
            rows: context?.accounts
          },
          { key: 'sources', field: 'ip' as const, title: 'sourceFocus', rows: context?.sources }
        ]
      : [{ key: 'modules', field: undefined, title: 'moduleDistribution', rows: context?.modules }];
  async function download() {
    if (!access.export || exporting || a.loading) return;
    setExporting(true);
    setExportError(false);
    try {
      const data = await a.download();
      if (data === undefined) return;
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-${kind}-${adminDate(Date.now(), timezone).slice(0, 13).replace(' ', '-')}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(text('audit.copied'));
    } catch {
      setCopyStatus(text('audit.copyError'));
    }
  }
  function detail(event?: AuditEvent) {
    return (
      <section aria-label={text('audit.eventDetail')} className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h3 className='font-semibold'>{text('audit.eventDetail')}</h3>
          <div className='flex gap-1'>
            {event && !expanded && (
              <AButton onClick={() => setExpanded(true)}>{text('audit.expandDetail')}</AButton>
            )}
            {(event || a.detailLoading || a.detailError) && (
              <AButton
                onClick={() => {
                  a.setSelectedID(undefined);
                  setExpanded(false);
                }}
              >
                {text('audit.closeDetail')}
              </AButton>
            )}
          </div>
        </div>
        {a.detailLoading ? (
          <div aria-busy='true' className='h-64 animate-pulse rounded bg-muted' />
        ) : a.detailError ? (
          <div role='alert'>
            {text('audit.loadError')}
            <AButton onClick={a.retryDetail}>{text('audit.retry')}</AButton>
          </div>
        ) : event ? (
          <>
            <p className={mutedClass}>{adminDate(event.occurred_at, timezone)}</p>
            <span
              className={
                event.status < 400
                  ? 'rounded bg-blue-500/10 px-2 py-1 text-sm text-blue-600'
                  : 'rounded bg-red-500/10 px-2 py-1 text-sm text-red-600'
              }
            >
              {text(event.status < 400 ? 'audit.success' : 'audit.failure')}
            </span>
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 break-words text-sm'>
              {[
                'id',
                'username',
                'user_id',
                'module',
                'status',
                'duration_ms',
                'ip',
                'method',
                'path',
                'operation',
                'resource_type',
                'resource_id',
                'error_code',
                'trace_id',
                'user_agent'
              ]
                .filter(
                  (key) =>
                    kind === 'operation' ||
                    !['operation', 'resource_type', 'resource_id'].includes(key)
                )
                .map((key) => (
                  <div className='contents' key={key}>
                    <dt className={mutedClass}>
                      {text(
                        `audit.${({ status: 'httpStatus', operation: 'operationType', resource_type: 'resourceType', resource_id: 'resourceId' } as Record<string, string>)[key] ?? key}`
                      )}
                    </dt>
                    <dd className='min-w-0 whitespace-pre-wrap break-words'>
                      {key === 'operation' && event.operation
                        ? text(`audit.operationTypes.${event.operation}`)
                        : String(event[key] ?? '—')}
                    </dd>
                  </div>
                ))}
            </dl>
            <div className='flex flex-wrap gap-2'>
              <AButton onClick={() => void copy(event.path)}>{text('audit.copyPath')}</AButton>
              <AButton disabled={!event.trace_id} onClick={() => void copy(event.trace_id)}>
                {text('audit.copyTrace')}
              </AButton>
            </div>
            {copyStatus && <p role='status'>{copyStatus}</p>}
            {kind === 'operation' && (
              <section className='space-y-3'>
                <p className={mutedClass}>{text('audit.paramsHint')}</p>
                {(['request_params', 'response_params'] as const).map((key) => (
                  <section
                    key={key}
                    aria-label={text(
                      key === 'request_params' ? 'audit.requestParams' : 'audit.responseParams'
                    )}
                  >
                    <h4 className='mb-2 font-medium'>
                      {text(
                        key === 'request_params' ? 'audit.requestParams' : 'audit.responseParams'
                      )}
                    </h4>
                    <div
                      data-testid='json-scroll'
                      role='textbox'
                      aria-readonly='true'
                      aria-multiline='true'
                      aria-label={text(
                        key === 'request_params' ? 'audit.requestParams' : 'audit.responseParams'
                      )}
                      tabIndex={0}
                      className='max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs'
                    >
                      <pre className='whitespace-pre-wrap break-words'>
                        {event[key] == null
                          ? text('audit.noParams')
                          : JSON.stringify(event[key], null, 2)}
                      </pre>
                    </div>
                  </section>
                ))}
              </section>
            )}
            <h4 className='font-semibold'>{text('audit.continue')}</h4>
            <div className='flex flex-wrap gap-2'>
              {event.username && (
                <AButton onClick={() => a.related('username', event.username)}>
                  {text('audit.sameActor')}
                </AButton>
              )}
              <AButton onClick={() => a.related('path', event.path)}>
                {text('audit.samePath')}
              </AButton>
              <AButton onClick={() => a.related('ip', event.ip)}>{text('audit.ip')}</AButton>
            </div>
          </>
        ) : (
          <p className={mutedClass}>{text('audit.selectRecord')}</p>
        )}
      </section>
    );
  }
  return (
    <AuditPageFrame title={title} allowed={access.menu}>
      {!access.read ? (
        <div className={panelClass}>{text('audit.noAccess')}</div>
      ) : (
        <div
          ref={root}
          className={
            fullscreen
              ? 'fixed inset-0 z-50 space-y-4 overflow-auto bg-background p-5'
              : 'space-y-4'
          }
          data-testid='audit-page'
        >
          <section className={panelClass}>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h2 className='font-semibold'>{text('audit.period')}</h2>
              <div role='group' aria-label={text('audit.period')} className='flex gap-2'>
                {[1, 7, 30].map((days) => (
                  <AButton key={days} active={a.days === days} onClick={() => a.setDays(days)}>
                    {text(`audit.period${days}`)}
                  </AButton>
                ))}
              </div>
            </div>
            {showOverviewWarning && (
              <div role='alert' className='my-3'>
                {text('audit.loadError')}
                <AButton onClick={a.refresh}>{text('audit.retry')}</AButton>
              </div>
            )}
            <div
              aria-busy={a.overviewLoading}
              className='mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5'
            >
              {[
                ['total', summary?.total ?? 0],
                ['successRate', `${Math.round(summary?.success_rate ?? 0)}%`],
                ['failed', summary?.failed ?? 0],
                ['uniqueUsers', summary?.unique_users ?? 0],
                ['p95', `${Math.round(summary?.p95_ms ?? 0)} ms`]
              ].map(([label, value]) => (
                <div key={label} className='rounded-lg border p-4'>
                  <span className={mutedClass}>{text(`audit.${label}`)}</span>
                  <strong className='mt-2 block text-2xl tabular-nums'>
                    {a.overviewLoading || a.overviewError ? '—' : value}
                  </strong>
                </div>
              ))}
            </div>
            <div className='mt-4 h-1.5 overflow-hidden rounded bg-red-500/60'>
              <div
                className='h-full bg-blue-500'
                style={{ width: `${summary?.success_rate ?? 0}%` }}
              />
            </div>
          </section>
          <div className='grid gap-4 xl:grid-cols-3'>
            <section className={cn(panelClass, 'xl:col-span-2')}>
              <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
                <h2 className='font-semibold'>
                  {text(kind === 'login' && view === 'heat' ? 'audit.heatmap' : 'audit.trend')}
                </h2>
                <div className='flex gap-2'>
                  {kind === 'login' && (
                    <>
                      <AButton active={view === 'heat'} onClick={() => setView('heat')}>
                        {text('audit.heatView')}
                      </AButton>
                      <AButton active={view === 'trend'} onClick={() => setView('trend')}>
                        {text('audit.trendView')}
                      </AButton>
                    </>
                  )}
                  {a.days === 30 &&
                    a.day &&
                    view === 'heat' &&
                    (['day', 'hour'] as const).map((level) => (
                      <AButton
                        key={level}
                        active={a.heatLevel === level}
                        onClick={() => {
                          a.setHeatLevel(level);
                          if (level === 'day' && a.day) a.selectCell(a.day, false);
                        }}
                      >
                        {text(`audit.${level}View`)}
                      </AButton>
                    ))}
                </div>
              </div>
              {(a.overviewLoading || a.overviewError) && !(kind === 'login' && view === 'heat') ? (
                <div
                  aria-label={text('audit.activityLoading')}
                  aria-busy='true'
                  className='h-64 animate-pulse rounded bg-muted'
                />
              ) : kind === 'login' && view === 'heat' ? (
                <div
                  ref={heatRoot}
                  role='group'
                  aria-label={text('audit.heatmap')}
                  aria-busy={a.overviewLoading}
                  className={cn('grid gap-1', a.overviewLoading && 'animate-pulse')}
                  style={{
                    gridTemplateColumns: `repeat(${a.days === 7 ? 24 : 6},minmax(0,1fr))`,
                    minHeight: 240
                  }}
                >
                  {a.heatCells.map((cell, index) => {
                    const maximum = Math.max(1, ...a.heatCells.map((value) => value.count));
                    const abnormal = !a.result && cell.failed > cell.count - cell.failed;
                    const color =
                      a.result === 'failure' || abnormal ? 'var(--color-red-700)' : 'var(--color-blue-700)';
                    const intensity = cell.count
                      ? abnormal
                        ? 28 + (cell.failed / cell.count - 0.5) * 120
                        : 18 + Math.sqrt(cell.count / maximum) * 76
                      : 0;
                    const label = text('audit.heatInterval', {
                      start: adminDate(cell.started_at, timezone),
                      end: adminDate(cell.ended_at, timezone),
                      count: cell.count,
                      failed: cell.failed
                    });
                    return (
                      <button
                        type='button'
                        key={`${cell.started_at}:${cell.hour}:${index}`}
                        disabled={
                          a.overviewLoading || a.overviewError || cell.ended_at <= cell.started_at
                        }
                        aria-label={label}
                        title={label}
                        aria-pressed={
                          a.cell?.started_at === cell.started_at &&
                          a.cell?.ended_at === cell.ended_at
                        }
                        className='min-h-6 min-w-0 rounded border text-xs aria-pressed:ring-2 aria-pressed:ring-current disabled:opacity-30'
                        style={{
                          backgroundColor: `color-mix(in srgb, ${color} ${intensity >= 60 ? Math.max(85, intensity) : intensity}%, var(--background))`,
                          color: intensity >= 60 ? 'var(--color-white)' : 'var(--foreground)'
                        }}
                        onClick={() => a.selectCell(cell)}
                        onKeyDown={(event) => {
                          const offsets = {
                            ArrowRight: 1,
                            ArrowLeft: -1,
                            ArrowDown: a.days === 7 ? 24 : 6,
                            ArrowUp: a.days === 7 ? -24 : -6
                          } as Record<string, number>;
                          const offset = offsets[event.key];
                          if (offset !== undefined) {
                            event.preventDefault();
                            const buttons =
                              heatRoot.current?.querySelectorAll<HTMLButtonElement>('button');
                            buttons?.[
                              Math.max(0, Math.min(a.heatCells.length - 1, index + offset))
                            ]?.focus();
                          }
                        }}
                        data-heat-index={index}
                      >
                        {a.days !== 7 && (
                          <>
                            <span className='block'>
                              {a.days === 1 || a.heatLevel === 'hour'
                                ? String(cell.hour).padStart(2, '0') + ':00'
                                : adminDate(cell.started_at, timezone).slice(5, 10)}
                            </span>
                            <small>{cell.count}</small>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <AuditTrend
                  summary={summary}
                  result={a.result}
                  onScope={a.selectInterval}
                  timezone={timezone}
                  text={text}
                />
              )}
            </section>
            <section className={panelClass} aria-label={text('audit.insight')}>
              <h2 className='font-semibold'>{text('audit.insight')}</h2>
              <div className={cn(mutedClass, 'my-3 min-h-16')}>
                {a.scope ? (
                  <>
                    <span className='block'>{adminDate(a.scope.from, timezone)}</span>
                    <span>—</span>
                    <span className='block'>{adminDate(a.scope.to, timezone)}</span>
                  </>
                ) : (
                  text(`audit.period${a.days}`)
                )}
              </div>
              {a.scope && <AButton onClick={a.clearScope}>{text('audit.allPeriods')}</AButton>}
              {showScopeWarning && <p role='alert'>{text('audit.loadError')}</p>}
              {ranks.map((rank) => (
                <section key={rank.key} className='mt-4'>
                  <h3 className='mb-2 text-sm font-semibold'>
                    {text(`audit.${rank.title}`)} · {text('audit.topEntries', { count: 10 })}
                  </h3>
                  <div aria-busy={a.scopeLoading} className='h-36 space-y-1 overflow-y-auto'>
                    {(rank.rows ?? []).slice(0, 10).map((row) => (
                      <button
                        type='button'
                        key={row.name}
                        aria-pressed={
                          rank.field ? a.exact[rank.field] === row.name : a.module === row.name
                        }
                        className='flex min-h-6 w-full justify-between gap-2 rounded p-1 text-start text-sm hover:bg-muted'
                        onClick={() => {
                          if (rank.field) a.related(rank.field, row.name);
                          else {
                            a.setModule(a.module === row.name ? '' : row.name);
                            a.setPage(1);
                          }
                        }}
                      >
                        <span className='min-w-0 break-words'>
                          {row.name || text('audit.anonymous')}
                        </span>
                        <strong>{rank.key === 'accounts' ? row.failed : row.total}</strong>
                      </button>
                    ))}
                    {!rank.rows?.length && (
                      <p className={mutedClass}>
                        {text(rank.key === 'accounts' ? 'audit.noFailures' : 'audit.empty')}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </section>
          </div>
          <section className={panelClass}>
            <div className='mb-3 flex flex-wrap gap-2'>
              {Object.entries(a.exact).map(([key, value]) => (
                <AButton
                  key={key}
                  onClick={() => {
                    a.setExact((old) => {
                      const next = { ...old };
                      delete next[key];
                      return next;
                    });
                    a.setPage(1);
                  }}
                >
                  {text(`audit.${key}`)}: {value} ×
                </AButton>
              ))}
            </div>
            <form
              className='flex flex-wrap items-end gap-3'
              onSubmit={(event) => {
                event.preventDefault();
                setSuggestOpen(false);
                a.search();
              }}
            >
              <div className='relative min-w-64 flex-1'>
                <label htmlFor='audit-search' className={mutedClass}>
                  {text('audit.search')}
                </label>
                <input
                  id='audit-search'
                  className='mt-1 w-full rounded-lg border bg-transparent p-2'
                  placeholder={text('audit.searchHint')}
                  value={a.draft}
                  onFocus={() => setSuggestOpen(true)}
                  onChange={(event) => a.setDraft(event.target.value)}
                  onBlur={() => {
                    a.searchSoon();
                    setTimeout(() => setSuggestOpen(false), 180);
                  }}
                />
                {suggestOpen && (
                  <div className='absolute z-20 mt-1 max-h-64 w-full min-w-80 overflow-auto rounded-lg border bg-card p-2 shadow-lg'>
                    {a.suggestions.flatMap((event, index) =>
                      ['username', 'ip', 'path', 'trace_id']
                        .filter((key) =>
                          String(event[key] ?? '')
                            .toLocaleLowerCase()
                            .includes(a.draft.trim().toLocaleLowerCase())
                        )
                        .map((key) => (
                          <button
                            type='button'
                            key={`${index}:${key}`}
                            className='block w-full break-words rounded p-2 text-start text-sm hover:bg-muted'
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              const value = String(event[key]);
                              a.setDraft(value);
                              a.search(value);
                              setSuggestOpen(false);
                            }}
                          >
                            <span className={mutedClass}>{text(`audit.${key}`)}: </span>
                            <Highlight value={String(event[key])} query={a.draft} />
                          </button>
                        ))
                    )}
                    {a.history
                      .filter((value) => value.includes(a.draft))
                      .map((value) => (
                        <button
                          type='button'
                          className='block w-full p-2 text-start text-sm'
                          key={value}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            a.setDraft(value);
                            a.search(value);
                            setSuggestOpen(false);
                          }}
                        >
                          {value}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <label className='space-y-1'>
                <span className={mutedClass}>{text('audit.status')}</span>
                <ASelect
                  label={text('audit.status')}
                  value={a.result}
                  onChange={(value) => {
                    a.setResult(value);
                    a.setPage(1);
                  }}
                  options={['', 'success', 'failure'].map((value) => ({
                    value,
                    label: text(`audit.${value || 'all'}`)
                  }))}
                />
              </label>
              {kind === 'operation' && (
                <label className='space-y-1'>
                  <span className={mutedClass}>{text('audit.module')}</span>
                  <ASelect
                    label={text('audit.module')}
                    value={a.module}
                    onChange={(value) => {
                      a.setModule(value);
                      a.setPage(1);
                    }}
                    options={[
                      '',
                      'auth',
                      'user',
                      'role',
                      'action',
                      'user-group',
                      'dictionary',
                      'whitelist',
                      'msg',
                      'session'
                    ].map((value) => ({
                      value,
                      label: value ? text(`audit.modules.${value}`) : text('audit.allModules')
                    }))}
                  />
                </label>
              )}
              <AButton
                onClick={() => {
                  setSuggestOpen(false);
                  a.search();
                }}
              >
                {text('audit.search')}
              </AButton>
              <AButton onClick={a.reset}>{text('audit.reset')}</AButton>
            </form>
          </section>
          <section className={panelClass}>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
              <h2 className='font-semibold'>
                {text(kind === 'login' ? 'audit.loginRecords' : 'audit.operationRecords')}
              </h2>
              <div className='flex flex-wrap gap-2'>
                <ASelect
                  label={text('audit.recordOrder')}
                  value={a.sort}
                  onChange={(value) => {
                    a.setSort(value);
                    a.setPage(1);
                  }}
                  options={['newest', 'failure', 'duration'].map((value, index) => ({
                    value,
                    label: text(`audit.${['timeFirst', 'failureFirst', 'byDuration'][index]}`)
                  }))}
                />
                <AuditTableTools
                  columns={allColumns.map((key) => ({ key, title: text(`audit.${key}`) }))}
                  visible={visibleColumns}
                  onVisible={setVisibleColumns}
                  density={density}
                  onDensity={setDensity}
                  style={tableStyle}
                  onStyle={setTableStyle}
                  fullscreen={fullscreen}
                  onFullscreen={() => setFullscreen((value) => !value)}
                  refresh={a.refresh}
                  loading={a.loading}
                />
                {access.export && (
                  <AButton
                    disabled={exporting || a.loading || a.error || a.total === 0}
                    onClick={() => void download()}
                  >
                    {text('audit.export')}
                  </AButton>
                )}
              </div>
            </div>
            {exportError && <p role='alert'>{text('audit.exportError')}</p>}
            {a.error && (
              <p role='alert'>
                {text('audit.loadError')}
                <AButton onClick={a.refresh}>{text('audit.retry')}</AButton>
              </p>
            )}
            <div
              className={
                kind === 'operation'
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]'
                  : ''
              }
            >
              <div className='min-w-0'>
                <div
                  className='overflow-auto rounded border'
                  style={{ height: kind === 'operation' ? 660 : 420 }}
                  aria-busy={a.loading}
                >
                  <table className='w-full text-sm'>
                    <thead className={tableStyle.sticky ? 'sticky top-0 bg-card' : 'bg-card'}>
                      <tr>
                        {visibleColumns.map((key) => (
                          <th
                            className={cn(
                              padding,
                              'text-start font-medium',
                              tableStyle.bordered ? 'border' : ''
                            )}
                            key={key}
                          >
                            {text(`audit.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {a.loading
                        ? Array.from({ length: a.size }, (_, i) => (
                            <tr key={i} aria-hidden='true'>
                              <td colSpan={8} className='p-3' aria-hidden='true'>
                                <div className='h-5 animate-pulse rounded bg-muted' />
                              </td>
                            </tr>
                          ))
                        : a.rows.map((row, rowIndex) => (
                            <tr
                              key={row.id}
                              tabIndex={0}
                              aria-selected={a.selectedID === row.id}
                              className={cn(
                                'cursor-pointer border-t hover:bg-muted/40 aria-selected:bg-muted',
                                tableStyle.striped && rowIndex % 2 ? 'bg-muted/30' : ''
                              )}
                              aria-label={text('audit.openEvent', { id: row.id })}
                              onClick={() => {
                                a.setSelectedID(row.id);
                                if (kind === 'login') setExpanded(true);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  a.setSelectedID(row.id);
                                  if (kind === 'login') setExpanded(true);
                                }
                              }}
                            >
                              {visibleColumns.map((key) => (
                                <td
                                  key={key}
                                  className={cn(
                                    'max-w-64 break-words',
                                    padding,
                                    tableStyle.bordered ? 'border' : ''
                                  )}
                                >
                                  {key === 'occurred_at' ? (
                                    adminDate(row.occurred_at, timezone)
                                  ) : key === 'status' ? (
                                    <span
                                      className={
                                        row.status < 400 ? 'text-blue-600' : 'text-red-600'
                                      }
                                    >
                                      {text(row.status < 400 ? 'audit.success' : 'audit.failure')}
                                    </span>
                                  ) : (
                                    String(row[key] ?? '—')
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                    </tbody>
                  </table>
                  {!a.loading && !a.rows.length && (
                    <p className='p-8 text-center'>{text('audit.empty')}</p>
                  )}
                </div>
                <div className='mt-3 flex flex-wrap items-center justify-between gap-3'>
                  <span className={mutedClass}>
                    {text('audit.recordCount', { count: a.total })}
                  </span>
                  <ASelect
                    label={text('audit.pageSize')}
                    value={String(a.size)}
                    onChange={(value) => {
                      a.setSize(Number(value));
                      a.setPage(1);
                    }}
                    options={[10, 20, 50, 100].map((size) => ({
                      value: String(size),
                      label: String(size)
                    }))}
                  />
                  <AButton
                    disabled={a.page === 1 || a.loading}
                    onClick={() => a.setPage((value) => value - 1)}
                  >
                    {text('system.common.previous')}
                  </AButton>
                  <span>
                    {a.page} / {Math.max(1, Math.ceil(a.total / a.size))}
                  </span>
                  <AButton
                    disabled={a.page * a.size >= a.total || a.loading}
                    onClick={() => a.setPage((value) => value + 1)}
                  >
                    {text('system.common.next')}
                  </AButton>
                </div>
              </div>
              {kind === 'operation' && (
                <aside className='max-h-[720px] overflow-auto rounded-lg border p-4'>
                  {detail(a.selected)}
                </aside>
              )}
            </div>
          </section>
          <AdminDrawer
            open={expanded}
            title={text('audit.eventDetail')}
            onClose={() => setExpanded(false)}
          >
            {detail(a.selected)}
          </AdminDrawer>
        </div>
      )}
    </AuditPageFrame>
  );
}
function Highlight({ value, query }: { value: string; query: string }) {
  const index = value.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  return index < 0 || !query.trim() ? (
    value
  ) : (
    <>
      {value.slice(0, index)}
      <mark className='bg-transparent text-red-600'>
        {value.slice(index, index + query.trim().length)}
      </mark>
      {value.slice(index + query.trim().length)}
    </>
  );
}

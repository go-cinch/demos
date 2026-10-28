/* oxlint-disable react/set-state-in-effect -- Reset async catalog state when the controlled record changes. */
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/i18n/locale-context';
import { type AdminRecord } from '@/features/admin/model';
import { getPermissionCatalog, hydrateActions } from './service';
import { actionSelection, normalizeSelection } from './permission-selection';
import { expandEffectiveSelection } from './permission-sources';
import ResourceEditor from './resource-editor';
import type { ActionResourceBinding, PermissionCatalog, UserPermissionSource } from './types';

export default function PermissionDetail({ record }: { record: AdminRecord }) {
  const { pick } = useLocale();
  const [source, setSource] = useState('all');
  const [catalog, setCatalog] = useState<PermissionCatalog>();
  const [resolved, setResolved] = useState<Record<string, ActionResourceBinding[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const sources = record.permission_sources as UserPermissionSource[] | undefined;
  const signature = JSON.stringify([
    record.id,
    record.action_codes,
    record.actions,
    sources,
    record.config
  ]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setResolved({});
    const actions = sources
      ? sources.flatMap((entry) => entry.actions)
      : Array.isArray(record.actions)
        ? record.actions
        : record.config
          ? [record]
          : [];
    const codes = [
      ...new Set([
        ...(sources
          ? sources.flatMap((entry) => entry.action_codes)
          : Array.isArray(record.action_codes)
            ? record.action_codes.map(String)
            : []),
        ...actions.map((action) => String(action.code))
      ])
    ];
    const supplied = new Map(actions.filter((action) => action.config).map((action) => [String(action.code), action]));
    Promise.all([getPermissionCatalog(), hydrateActions(codes.filter((code) => !supplied.has(code)))])
      .then(([document, definitions]) => {
        if (!active) return;
        const next: Record<string, ActionResourceBinding[]> = {},
          missing: string[] = [];
        for (const code of codes) {
          try {
            const action = supplied.get(code) ?? definitions.get(code);
            if (!action) throw new Error();
            const bindings = actionSelection(document.resource_catalog, action);
            next[code] = sources
              ? expandEffectiveSelection(document.resource_catalog, bindings)
              : bindings;
          } catch {
            missing.push(code);
          }
        }
        setCatalog(document);
        setResolved(next);
        setMissing(missing);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [signature, retry]);
  const visibleSources = sources?.filter((entry) => source === 'all' || entry.kind === source);
  const visibleCodes = visibleSources
    ? [
        ...new Set(
          visibleSources.flatMap((entry) => [
            ...entry.action_codes,
            ...entry.actions.map((action) => action.code)
          ])
        )
      ]
    : Object.keys(resolved);
  const selection = catalog
    ? normalizeSelection(
        catalog.resource_catalog,
        visibleCodes.flatMap((code) => resolved[code] ?? [])
      )
    : [];
  return (
    <section className='space-y-4' data-testid='permission-detail' aria-busy={loading}>
      <h3 className='font-semibold'>{pick('Permissions', '权限')}</h3>
      {sources && (
        <>
          <div
            className='flex flex-wrap gap-2'
            data-testid='permission-source-filter'
            role='group'
            aria-label={pick('Permission sources', '权限来源')}
          >
            {[
              ['direct', pick('Direct', '直接')],
              ['role', pick('Role', '角色')],
              ['group', pick('User groups', '用户组')],
              ['all', pick('Merged', '合并来源')]
            ].map(([key, title]) => (
              <Button
                key={key}
                type='button'
                variant={source === key ? 'default' : 'outline'}
                onClick={() => setSource(key)}
              >
                {title}
              </Button>
            ))}
          </div>
          <p className='text-sm text-muted-foreground'>
            {visibleSources
              ?.filter((entry) => entry.kind !== 'direct')
              .map((entry) => entry.name)
              .join(', ')}
          </p>
        </>
      )}
      {failed && (
        <div role='alert'>
          {pick('Unable to load permissions', '无法加载权限')}
          <Button type='button' onClick={() => setRetry((value) => value + 1)}>
            {pick('Retry', '重试')}
          </Button>
        </div>
      )}
      {missing.filter((code) => !sources || visibleCodes.includes(code)).length > 0 && (
        <p className='text-amber-600'>
          {pick('Some revoked definitions cannot be displayed.', '部分已撤销的权限定义无法显示。')}
        </p>
      )}
      {loading ? (
        <div className='h-64 animate-pulse rounded bg-muted' />
      ) : (
        !failed &&
        catalog && (
          <>
            <ResourceEditor key={source} catalog={catalog} selection={selection} readOnly />
            {!selection.length && (
              <p className='text-muted-foreground'>
                {pick('No permissions in this source', '此来源暂无权限')}
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}

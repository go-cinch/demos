'use client';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/features/i18n/locale-context';
import { useCatalogLabels } from './catalog-context';
import {
  permissionOperations,
  resourceBreadcrumb,
  resolveResourceBindings
} from './resource-catalog';
import {
  orderPermissionResourceKeys,
  resourceReferenceTree,
  referenceResourceBindings,
  referencedOperations,
  type ReferenceTreeNode
} from './resource-references';
import { normalizeSelection } from './permission-selection';
import type { ActionResourceBinding, PermissionCatalog } from './types';

export default function ResourceEditor({
  catalog,
  selection,
  onChange,
  readOnly = false,
  defaultMode = false,
  assignment = false
}: {
  catalog: PermissionCatalog;
  selection: ActionResourceBinding[];
  onChange?: (bindings: ActionResourceBinding[]) => void;
  readOnly?: boolean;
  defaultMode?: boolean;
  assignment?: boolean;
}) {
  const { pick } = useLocale();
  const { label } = useCatalogLabels();
  const [scope, setScope] = useState(
    selection[0]?.resource_key.split(':')[0] ?? catalog.scopes[0] ?? 'admin'
  );
  const [query, setQuery] = useState('');
  const [technical, setTechnical] = useState(false);
  const [pendingResources, setPendingResources] = useState<string[]>([]);
  const ordered = orderPermissionResourceKeys(
    catalog.resource_catalog,
    scope,
    [...new Set([...selection.map((binding) => binding.resource_key), ...pendingResources])]
      .filter((key) => key.startsWith(`${scope}:`) && catalog.resource_catalog.resources[key]?.kind === 'resource')
  );
  const resources = ordered
    .map((key) => [key, catalog.resource_catalog.resources[key]!] as const)
    .filter(
      ([key]) =>
        !query ||
        `${key} ${resourceBreadcrumb(catalog.resource_catalog, key, (id) => label('resources', id))}`
          .toLowerCase()
          .includes(query.toLowerCase())
    );
  const tree = resourceReferenceTree(catalog.resource_catalog, scope, query, (key) =>
    label('resources', key)
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(Object.keys(catalog.resource_catalog.resources))
  );
  const [focused, setFocused] = useState('');
  const operationsFor = (key: string) => {
    const node = catalog.resource_catalog.resources[key]!;
    return node.permission_scope === '*'
      ? ['*']
      : (defaultMode ? ['read'] : permissionOperations).filter(
          (operation) => node.operations?.[operation]
        );
  };
  const isFullOperation = (key: string, operation: string) => {
    const binding = selection.find((item) => item.resource_key === key && item.operation === operation);
    const features = catalog.resource_catalog.resources[key]?.operations?.[operation]?.button_keys ?? [];
    return !!binding && features.every((feature) => (binding.feature_keys ?? features).includes(feature));
  };
  function toggleResource(key: string, checked: boolean) {
    setPendingResources((old) => checked ? old.filter((item) => item !== key) : [...new Set([...old, key])]);
    const rest = selection.filter((item) => item.resource_key !== key);
    onChange?.(
      normalizeSelection(
        catalog.resource_catalog,
        checked
          ? [
              ...rest,
              ...operationsFor(key).map((operation) => ({
                resource_key: key,
                operation,
                feature_keys: [
                  ...(catalog.resource_catalog.resources[key]?.operations?.[operation]
                    ?.button_keys ?? [])
                ]
              }))
            ]
          : rest
      )
    );
  }
  function renderTree(nodes: ReferenceTreeNode[]): ReactNode {
    return nodes.map((node) => {
      const key = node.referenceTarget ?? node.key;
      const allowed = node.referenceOwner
        ? referencedOperations(catalog.resource_catalog, node.referenceOwner, key)
        : [...permissionOperations, '*'];
      const selections = [...referenceResourceBindings(catalog.resource_catalog, key, allowed)]
        .map(([resource, operations]) => [resource, operations.filter((operation) => operationsFor(resource).includes(operation))] as const)
        .filter(([, operations]) => operations.length);
      const hasOperation = (resource: string, operation: string) => selection.some((item) => item.resource_key === resource && item.operation === operation);
      const selected = selections.map(([resource, operations]) => node.referenceOwner
        ? operations.every((operation) => hasOperation(resource, operation))
        : pendingResources.includes(resource) || operations.some((operation) => hasOperation(resource, operation)));
      const checked = selected.length > 0 && selected.every(Boolean);
      const partial = !checked && selections.some(([resource, operations]) => pendingResources.includes(resource) || operations.some((operation) => hasOperation(resource, operation)));
      const operations = selections.flatMap(([key, operations]) => operations.map((operation) => ({ key, operation })));
      return (
        <div key={node.key}>
          <div className='flex items-center gap-2 rounded-md p-2 hover:bg-muted'>
            {node.children.length > 0 && (
              <button
                type='button'
                className='w-4 text-sm'
                aria-label={pick('Expand directory', '展开目录')}
                aria-expanded={expanded.has(node.key)}
                onClick={() =>
                  setExpanded((old) => {
                    const next = new Set(old);
                    if (next.has(node.key)) next.delete(node.key);
                    else next.add(node.key);
                    return next;
                  })
                }
              >
                {expanded.has(node.key) ? '−' : '+'}
              </button>
            )}
            <Checkbox
              disabled={readOnly || !operations.length}
              checked={checked}
              indeterminate={partial}
              aria-label={node.title}
              onCheckedChange={(value) => {
                const removing = !value;
                const rest = selection.filter((binding) => !removing || !selections.some(([resource, operations]) => binding.resource_key === resource && operations.includes(binding.operation)));
                if (removing) setPendingResources((old) => old.filter((resource) => !selections.some(([key]) => key === resource)));
                else for (const [resource_key, operations] of selections) {
                  if (!node.referenceOwner && rest.some((binding) => binding.resource_key === resource_key && operations.includes(binding.operation))) continue;
                  for (const operation of node.referenceOwner ? operations : operations.slice(0, 1)) {
                    if (!rest.some((binding) => binding.resource_key === resource_key && binding.operation === operation))
                      rest.push({ resource_key, operation, feature_keys: [...(catalog.resource_catalog.resources[resource_key]?.operations?.[operation]?.button_keys ?? [])] });
                  }
                }
                onChange?.(normalizeSelection(catalog.resource_catalog, rest));
              }}
            />
            <button
              type='button'
              className='min-w-0 flex-1 break-words text-left text-sm'
              onClick={() => {
                setFocused(key);
                document.getElementById(`permission-${key}`)?.scrollIntoView({
                  block: 'nearest',
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth'
                });
              }}
            >
              {node.referenceTarget ? '↗ ' : ''}
              {node.title}
            </button>
          </div>
          {expanded.has(node.key) && (
            <div className='ml-4 border-l pl-2'>{renderTree(node.children)}</div>
          )}
        </div>
      );
    });
  }
  const config = resolveResourceBindings(
    catalog.resource_catalog,
    scope,
    selection.filter((item) => item.resource_key.startsWith(`${scope}:`))
  );
  function update(key: string, operation: string, features?: string[]) {
    const rest = selection.filter(
      (item) => item.resource_key !== key || item.operation !== operation
    );
    setPendingResources((old) => [...new Set([...old, key])]);
    onChange?.(
      normalizeSelection(
        catalog.resource_catalog,
        features === undefined
          ? rest
          : [...rest, { resource_key: key, operation, feature_keys: features }]
      )
    );
  }
  return (
    <section className='space-y-4' data-testid='permission-resource-editor'>
      <div className='flex flex-wrap gap-2' role='group' aria-label={pick('Scope', '作用域')}>
        {catalog.scopes.map((value) => (
          <Button
            type='button'
            key={value}
            variant={scope === value ? 'default' : 'outline'}
            onClick={() => setScope(value)}
          >
            {label('scopes', value)}
          </Button>
        ))}
      </div>
      <Input
        aria-label={pick('Search resources', '搜索资源')}
        placeholder={pick('Search resources', '搜索资源')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div
        className='grid gap-4 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.4fr)]'
        data-permission-region
      >
        <aside
          className='max-h-[32rem] overflow-auto rounded-lg border p-2'
          aria-label={pick('Resource directory', '资源目录')}
        >
          {renderTree(tree)}
        </aside>
        <div className='max-h-[32rem] space-y-3 overflow-auto'>
          {resources.map(([key, node]) => {
            const selected = selection.filter((item) => item.resource_key === key);
            const operations = operationsFor(key);
            const allChecked =
              operations.length > 0 &&
              operations.every((operation) =>
                isFullOperation(key, operation)
              );
            return (
              <article
                key={key}
                id={`permission-${key}`}
                data-focused={focused === key}
                data-resource-key={key}
                data-permission-resource-key={key}
                className='rounded-lg border p-4'
              >
                <label className='flex items-center gap-2 font-medium'>
                  <Checkbox
                    checked={allChecked}
                    indeterminate={selected.length > 0 && !allChecked}
                    disabled={readOnly}
                    onCheckedChange={(checked) => toggleResource(key, !!checked)}
                    aria-label={pick(
                      `Select resource ${label('resources', key)}`,
                      `选择资源${label('resources', key)}`
                    )}
                  />
                  {label('resources', key)}
                </label>
                <p className='mb-3 text-xs text-muted-foreground'>
                  {resourceBreadcrumb(catalog.resource_catalog, key, (id) =>
                    label('resources', id)
                  )}
                </p>
                <div className='space-y-3'>
                  {operations.filter((operation) => !readOnly || selected.some((binding) => binding.operation === operation)).map((operation) => {
                    const binding = selected.find((item) => item.operation === operation);
                    const features = node.operations?.[operation]?.button_keys ?? [];
                    return (
                      <div key={operation} className='rounded-md border p-3'>
                        <label className='flex items-center gap-2 font-medium'>
                          <Checkbox
                            disabled={readOnly}
                            checked={!!binding && (!assignment || isFullOperation(key, operation))}
                            indeterminate={assignment && !!binding && !isFullOperation(key, operation)}
                            onCheckedChange={(checked) =>
                              update(key, operation, checked ? [...features] : undefined)
                            }
                            aria-label={`${label('resources', key)} ${label('operations', operation)}`}
                          />
                          {operation === '*' ? pick('All', '全部') : label('operations', operation)}
                        </label>
                        {binding && (
                          <div className='mt-3 flex flex-wrap gap-3'>
                            {features.some((feature) => !readOnly || (binding.feature_keys ?? features).includes(feature)) ? (
                              features.filter((feature) => !readOnly || (binding.feature_keys ?? features).includes(feature)).map((feature) => (
                                <label
                                  key={feature}
                                  className='flex items-center gap-2 text-sm'
                                  data-permission-feature-key={feature}
                                >
                                  <Checkbox
                                    disabled={readOnly}
                                    checked={(binding.feature_keys ?? features).includes(feature)}
                                    aria-label={label('features', feature)}
                                    onCheckedChange={(checked) =>
                                      update(
                                        key,
                                        operation,
                                        checked
                                          ? [...(binding.feature_keys ?? features), feature]
                                          : assignment && (binding.feature_keys ?? features).filter((value) => value !== feature).length === 0
                                            ? undefined
                                            : (binding.feature_keys ?? features).filter((value) => value !== feature)
                                      )
                                    }
                                  />
                                  {label('features', feature)}
                                </label>
                              ))
                            ) : (
                              <span className='text-sm text-muted-foreground'>
                                {pick('No selected features', '未选择附加功能')}
                              </span>
                            )}
                          </div>
                        )}
                        {binding && (
                          <div className='mt-2 flex flex-wrap gap-1'>
                            {config.ui
                              .filter((entry) => entry.page_entry && node.entries?.[entry.menu_key])
                              .map((entry) => (
                                <Badge variant='secondary' key={entry.menu_key}>
                                  {entry.menu_path}
                                </Badge>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
          {!resources.length && (
            <p className='p-6 text-muted-foreground'>{pick('No resources', '暂无资源')}</p>
          )}
        </div>
      </div>
      <details open={technical} onToggle={(event) => setTechnical(event.currentTarget.open)}>
        <summary className='cursor-pointer text-sm'>
          {pick('Technical details (generated)', '技术详情（自动生成）')}
        </summary>
        <pre className='mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border p-3 text-xs'>
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>
    </section>
  );
}

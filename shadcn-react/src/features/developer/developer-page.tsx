'use client';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AdminConfirm, AdminDrawer, useAdminText } from '@/features/system/components/admin-ui';
import { StyledSelect } from '@/features/system/components/record-selects';
import { useLocale } from '@/features/i18n/locale-context';
import { adminDate } from '@/features/admin/model';
import { resourceChildren, storeResourceOrder } from '@/features/permissions/resource-order';
import {
  availableReferenceOperations,
  canReferenceResource
} from '@/features/permissions/resource-references';
import { permissionOperations } from '@/features/permissions/resource-catalog';
import GroupWorkspace from './group-workspace';
import { useCatalogDraft } from './use-catalog-draft';
import {
  assign,
  at,
  clone,
  isCatalog,
  messagePaths,
  normalizeCatalog,
  setText,
  text,
  validate,
  type Catalog,
  type ResourceEditor as ResourceEditorModel
} from './catalog-model';
import {
  applyResourceEditor,
  createResourceEditor,
  resourceTypeChangeIssue
} from './resource-editor-model';
import {
  canMoveResource,
  moveReference,
  moveResource,
  resourceStep,
  type ResourceDestination
} from './resource-movement';
import { resourceDropTarget, resourceRowId, referenceStep, type ResourceTreeRow, type ResourceDrop } from './resource-drag';
import { legacyResourceRenames, mergeKeyRenames, readRenameMap } from './resource-renames';

const normalizeScopeIdentifier = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');

export default function DeveloperPage() {
  const draft = useCatalogDraft();
  const { pick, locale, timezone } = useLocale();
  const textLabel = useAdminText();
  const aliases: Record<string, string> = {
    languageTag: 'identifier',
    name: 'languageName',
    defaultLanguage: 'defaultLocale',
    setDefault: 'defaultLocale',
    addLanguage: 'add',
    scopeKey: 'newScope',
    addScope: 'add',
    addDirectory: 'add',
    addResource: 'add',
    root: 'rootDirectory',
    frontend: 'category',
    backend: 'category',
    previous: 'up',
    next: 'down',
    mergeOnline: 'applyMerge',
    useLocal: 'keepLocal',
    noChanges: 'noDifferences',
    scopeInUse: 'scopeInUse'
  };
  const t = (key: string, params?: Record<string, string | number>) =>
    textLabel(`developer.${aliases[key] ?? key}`, params);
  const file = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState(false);
  const [confirm, setConfirm] = useState<'publish' | 'discard' | 'node' | 'leave'>();
  const [pendingNavigation, setPendingNavigation] = useState<() => void>();
  const [issue, setIssue] = useState('');
  const [moveKey, setMoveKey] = useState('');
  const [moveParent, setMoveParent] = useState('');
  const [scopeIssue, setScopeIssue] = useState('');
  const [messageKey, setMessageKey] = useState('');
  const dragSource = useRef<ResourceTreeRow | null>(null);
  const [dragging, setDragging] = useState<ResourceTreeRow | null>(null);
  const [dropPreview, setDropPreview] = useState<ResourceDrop | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const expandCandidate = useRef('');
  useEffect(() => () => clearTimeout(expandTimer.current), []);

  const document = draft.draft?.document;
  const ui = draft.draft?.ui;
  const newScope = ui?.newScope ?? '';
  const label = (kind: string, key: string) =>
    document
      ? text(document, locale, kind, key) ||
        text(document, document.default_locale, kind, key) ||
        key
      : key;
  const disabled = !draft.canEdit;
  function navigate(action: () => void) {
    if (ui?.resourceEditor || ui?.groupEditor) {
      setPendingNavigation(() => action);
      setConfirm('leave');
    } else action();
  }
  useEffect(() => {
    if (!ui?.resourceEditor && !ui?.groupEditor) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigation = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a');
      if (
        anchor?.href &&
        new URL(anchor.href).origin === location.origin &&
        new URL(anchor.href).pathname !== location.pathname
      ) {
        event.preventDefault();
        setPendingNavigation(() => () => {
          location.href = anchor.href;
        });
        setConfirm('leave');
      }
    };
    const beforeNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; proceed: () => void }>).detail;
      if (detail.path === '/system/developer') return;
      event.preventDefault();
      setPendingNavigation(() => detail.proceed);
      setConfirm('leave');
    };
    const closeTab = (event: Event) => {
      const path = (event as CustomEvent<{ path: string }>).detail.path;
      if (path === '/system/developer') {
        event.preventDefault();
        setPendingNavigation(() => () => {
          window.dispatchEvent(new CustomEvent('go-cinch-close-tab', { detail: { path } }));
        });
        setConfirm('leave');
      }
    };
    window.addEventListener('go-cinch-before-navigate', beforeNavigate);
    window.addEventListener('go-cinch-before-tab-close', closeTab);
    window.addEventListener('beforeunload', unload);
    window.document.addEventListener('click', navigation, true);
    return () => {
      window.removeEventListener('go-cinch-before-navigate', beforeNavigate);
      window.removeEventListener('go-cinch-before-tab-close', closeTab);
      window.removeEventListener('beforeunload', unload);
      window.document.removeEventListener('click', navigation, true);
    };
  }, [!!ui?.resourceEditor, !!ui?.groupEditor]);
  function execute(action: () => void) {
    try {
      action();
      setIssue('');
    } catch (error) {
      setIssue(error instanceof Error ? t(error.message) : t('invalid'));
    }
  }
  function exportDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft.draft, null, 2)], { type: 'application/json' })
    );
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'I18N_CATALOG-draft.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importDraft(file?: File) {
    if (!file || file.size > 2 * 1024 * 1024 || !draft.canEdit) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      const imported = isCatalog(value)
        ? value
        : value && typeof value === 'object' && 'document' in value && isCatalog(value.document)
          ? value.document
          : undefined;
      if (!imported) throw new Error();
      draft.mutate((draft) => {
        draft.document = normalizeCatalog(imported);
        const renames = legacyResourceRenames(draft.base, imported);
        const importedUI =
          value && typeof value === 'object' && 'ui' in value
            ? (value.ui as Record<string, unknown>)
            : {};
        draft.ui.resourceRenames = {
          ...renames.resources,
          ...readRenameMap(importedUI.resourceRenames)
        };
        draft.ui.featureRenames = {
          ...renames.features,
          ...readRenameMap(importedUI.featureRenames)
        };
        draft.ui.groupRenames = readRenameMap(importedUI.groupRenames);
        draft.ui.resourceEditor = null;
        draft.ui.groupEditor = null;
        draft.ui.tab = 'diff';
      });
    } catch {
      setIssue(t('importFailed'));
    }
  }
  function addScope() {
    if (disabled || !document) return;
    const normalized = normalizeScopeIdentifier(newScope);
    draft.mutate((draft) => { draft.ui.newScope = normalized; });
    if (!/^[a-z]+$/.test(normalized)) {
      setScopeIssue('scopeIdentifierInvalid');
      return;
    }
    if (document.scopes.includes(normalized)) {
      setScopeIssue('duplicate');
      return;
    }
    draft.mutate((draft) => {
      draft.document.scopes.push(normalized);
      draft.ui.newScope = '';
    });
    setScopeIssue('');
  }
  function openNode(key = '', parent = '') {
    if (!document || !ui) return;
    navigate(() =>
      draft.mutate((draft) => {
        draft.ui.resourceEditor = createResourceEditor(draft.document, ui.scope, key, parent);
      })
    );
  }
  function move(key: string, destination: ResourceDestination) {
    if (!document) return;
    execute(() => {
      const result = moveResource(document, key, destination, ui?.resourceRenames);
      draft.mutate((draft) => {
        draft.document = result.document;
        draft.ui.resource = result.key;
        draft.ui.resourceRenames = mergeKeyRenames(draft.ui.resourceRenames, result.resourceKeys);
        draft.ui.featureRenames = mergeKeyRenames(draft.ui.featureRenames, result.featureKeys);
      });
    });
  }
  const dragEnabled = !disabled && !ui?.resourceEditor && !ui?.query.trim();
  function finishDrag() {
    dragSource.current = null;
    setDragging(null);
    setDropPreview(null);
    clearTimeout(expandTimer.current);
    expandCandidate.current = '';
  }
  function resolveDrop(event: DragEvent<HTMLDivElement>, target: ResourceTreeRow) {
    if (!dragEnabled || !document || !ui || !dragSource.current) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    return resourceDropTarget(document, ui.scope, dragSource.current, target,
      (event.clientY - bounds.top) / Math.max(bounds.height, 1));
  }
  function previewDrop(event: DragEvent<HTMLDivElement>, target: ResourceTreeRow) {
    event.preventDefault();
    event.stopPropagation();
    const preview = resolveDrop(event, target);
    event.dataTransfer.dropEffect = preview ? 'move' : 'none';
    setDropPreview((previous) => previous && preview && previous.mode === preview.mode &&
      resourceRowId(previous.row) === resourceRowId(preview.row) ? previous : preview);
    const candidate = preview?.mode === 'inside' ? resourceRowId(target) : '';
    if (candidate !== expandCandidate.current) {
      clearTimeout(expandTimer.current);
      expandCandidate.current = candidate;
      const expandedKey = `${target.parent}|${target.kind}|${target.key}`;
      if (candidate && !ui?.expanded.includes(expandedKey))
        expandTimer.current = setTimeout(() => {
          if (expandCandidate.current === candidate)
            draft.mutate((draft) => { draft.ui.expanded = [...new Set([...draft.ui.expanded, expandedKey])]; });
        }, 550);
    }
  }
  function commitDrop(event: DragEvent<HTMLDivElement>, target: ResourceTreeRow) {
    event.preventDefault();
    event.stopPropagation();
    const source = dragSource.current;
    const preview = resolveDrop(event, target);
    finishDrag();
    if (!preview || !source || !document) return;
    if (source.kind === 'reference')
      execute(() => {
        const next = moveReference(document, source.parent, source.key, preview.destination);
        draft.mutate((draft) => { draft.document = next; });
      });
    else navigate(() => move(source.key, preview.destination));
  }
  function nodeTree(parent = '', seen = new Set<string>()): ReactNode {
    if (!document || !ui || seen.has(parent)) return null;
    const path = new Set([...seen, parent]);
    return resourceChildren(document.resource_catalog, parent, ui.scope).map((entry) => {
      const node = document.resource_catalog.resources[entry.key];
      if (!node) return null;
      const matches =
        !ui.query ||
        `${entry.key} ${label('resources', entry.key)}`
          .toLowerCase()
          .includes(ui.query.toLowerCase());
      const children = nodeTree(entry.key, path);
      const row = { parent, ...entry };
      const dropMode = dropPreview && resourceRowId(dropPreview.row) === resourceRowId(row) ? dropPreview.mode : undefined;
      return (
        <div key={`${entry.kind}:${entry.key}`} className='min-w-0'>
          <div
            className={[
              'relative flex items-center gap-1 rounded-md hover:bg-muted',
              dragging && resourceRowId(dragging) === resourceRowId(row) && 'opacity-50',
              dropMode === 'before' && 'before:absolute before:inset-x-0 before:top-0 before:border-t-2 before:border-primary',
              dropMode === 'after' && 'after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary',
              dropMode === 'inside' && 'bg-primary/10 ring-2 ring-primary'
            ].filter(Boolean).join(' ')}
            draggable={dragEnabled}
            data-tree-key={resourceRowId(row)}
            data-resource-key={entry.kind === 'node' ? entry.key : undefined}
            data-drop-mode={dropMode}
            onDragStart={(event) => {
              event.stopPropagation();
              if (!dragEnabled) { event.preventDefault(); return; }
              dragSource.current = row;
              setDragging(row);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', resourceRowId(row));
            }}
            onDragEnd={(event) => { event.stopPropagation(); finishDrag(); }}
            onDragOver={(event) => previewDrop(event, row)}
            onDrop={(event) => commitDrop(event, row)}
          >
            {(node.kind === 'directory' || entry.kind === 'reference') && (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                aria-label={pick('Expand directory', '展开目录')}
                onClick={() =>
                  draft.mutate((draft) => {
                    draft.ui.expanded = draft.ui.expanded.includes(
                      `${parent}|${entry.kind}|${entry.key}`
                    )
                      ? draft.ui.expanded.filter(
                          (key) => key !== `${parent}|${entry.kind}|${entry.key}`
                        )
                      : [...draft.ui.expanded, `${parent}|${entry.kind}|${entry.key}`];
                  })
                }
              >
                {ui.expanded.includes(`${parent}|${entry.kind}|${entry.key}`) ? '−' : '+'}
              </Button>
            )}
            <Button
              type='button'
              variant={ui.resource === entry.key ? 'secondary' : 'ghost'}
              className='h-auto min-w-0 flex-1 justify-start whitespace-normal text-start'
              onClick={() =>
                navigate(() =>
                  draft.mutate((draft) => {
                    draft.ui.resource = entry.key;
                  })
                )
              }
            >
              {entry.kind === 'reference' ? '↗ ' : node.kind === 'directory' ? '▸ ' : ''}
              {label('resources', entry.key)}
              {!matches && ui.query ? '' : ''}
            </Button>
          </div>
          {ui.expanded.includes(`${parent}|${entry.kind}|${entry.key}`) && (
            <div className='ml-4 border-l pl-2'>{children}</div>
          )}
        </div>
      );
    });
  }
  const node = document && ui ? document.resource_catalog.resources[ui.resource] : undefined;
  const errors = draft.problems.filter((problem) => !problem.warning);
  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')} access={draft.canRead}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div
            role='status'
            data-testid='draft-status'
            className={
              draft.storageError || draft.external ? 'text-destructive' : 'text-emerald-600'
            }
          >
            {t(
              draft.external ? 'externalDraft' : draft.storageError ? 'saveFailed' : 'savedLocally'
            )}
            {draft.draft?.savedAt ? (
              <p className='text-xs text-muted-foreground'>
                {t('lastSaved')} {adminDate(draft.draft.savedAt, timezone)}
              </p>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={!document}
              onClick={() => setInfo(true)}
            >
              {t('localDraft')}
            </Button>
            <Button
              type='button'
              variant='outline'
              data-testid='compare-online'
              onClick={() =>
                navigate(() => {
                  draft.mutate((draft) => {
                    draft.ui.tab = 'diff';
                  });
                  void draft.refresh();
                })
              }
            >
              {t('compareOnline')} {draft.changes.length}
            </Button>
            <Button
              type='button'
              data-testid='submit-catalog'
              disabled={
                disabled ||
                draft.storageError ||
                !draft.changes.length ||
                !!ui?.buffer ||
                !!ui?.resourceEditor ||
                !!ui?.groupEditor
              }
              onClick={() => void draft.preparePublish().then((latest) => { if (latest) setConfirm('publish'); })}
            >
              {t('submit')}
            </Button>
          </div>
        </div>
        {draft.restored && <p className='rounded-lg border p-3 text-sm'>{t('restored')}</p>}
        {(draft.error || issue) && (
          <div role='alert' className='rounded-lg border border-destructive p-3 text-destructive'>
            {issue || t(draft.error)}{' '}
            <Button
              type='button'
              variant='outline'
              onClick={() => void (document ? draft.refresh() : draft.initialize())}
            >
              {t('retry')}
            </Button>
          </div>
        )}
        {draft.external && (
          <div role='alert' className='rounded-lg border border-amber-500 p-3'>
            {t('externalHint')}
            <Button type='button' onClick={exportDraft}>
              {t('exportMine')}
            </Button>
            <Button
              type='button'
              data-testid='load-external-draft'
              onClick={() => void draft.initialize()}
            >
              {t('loadExternal')}
            </Button>
          </div>
        )}
        {draft.loading && !document ? (
          <div className='h-96 animate-pulse rounded-lg bg-muted' />
        ) : (
          document &&
          ui && (
            <>
              <div role='tablist' className='flex flex-wrap gap-1 border-b pb-2'>
                {[
                  ['languages', t('languages')],
                  ['scopes', t('scopes')],
                  ['resources', t('resources')],
                  ['groups', t('permissionGroups')],
                  ['messages', t('messages')],
                  ['diff', t('diff')]
                ].map(([key, title]) => (
                  <Button
                    type='button'
                    role='tab'
                    aria-selected={ui.tab === key}
                    variant={ui.tab === key ? 'default' : 'ghost'}
                    key={key}
                    onClick={() =>
                      navigate(() =>
                        draft.mutate((draft) => {
                          draft.ui.tab = key;
                        })
                      )
                    }
                  >
                    {title}
                  </Button>
                ))}
              </div>
              {ui.tab === 'languages' && (
                <div className='space-y-3'>
                  {document.locales.map((language, index) => (
                    <div
                      key={index}
                      className='flex flex-wrap items-end gap-3 rounded-lg border p-4'
                    >
                      <Field
                        label={t('languageTag')}
                        value={language.tag}
                        disabled={disabled}
                        onChange={(tag) =>
                          draft.mutate((draft) => {
                            const previous = draft.document.locales[index]!.tag;
                            if (draft.document.messages[tag] && tag !== previous)
                              throw new Error('duplicate');
                            draft.document.locales[index]!.tag = tag;
                            draft.document.messages[tag] = draft.document.messages[previous] ?? {
                              frontend: {},
                              backend: {}
                            };
                            if (tag !== previous) delete draft.document.messages[previous];
                            if (draft.document.default_locale === previous)
                              draft.document.default_locale = tag;
                          })
                        }
                      />
                      <Field
                        label={t('name')}
                        value={language.name}
                        disabled={disabled}
                        onChange={(name) =>
                          draft.mutate((draft) => {
                            draft.document.locales[index]!.name = name;
                          })
                        }
                      />
                      <label className='flex items-center gap-2'>
                        <Switch
                          disabled={disabled || language.tag === document.default_locale}
                          checked={language.enabled}
                          onCheckedChange={(value) =>
                            draft.mutate((draft) => {
                              draft.document.locales[index]!.enabled = value;
                            })
                          }
                        />
                        {t('enabled')}
                      </label>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={disabled || !language.enabled}
                        onClick={() =>
                          draft.mutate((draft) => {
                            draft.document.default_locale = language.tag;
                          })
                        }
                      >
                        {language.tag === document.default_locale
                          ? t('defaultLanguage')
                          : t('setDefault')}
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={disabled || language.tag === document.default_locale}
                        onClick={() =>
                          draft.mutate((draft) => {
                            draft.document.locales.splice(index, 1);
                            delete draft.document.messages[language.tag];
                          })
                        }
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  ))}
                  <Button
                    type='button'
                    disabled={disabled}
                    onClick={() =>
                      draft.mutate((draft) => {
                        draft.document.locales.push({ tag: '', name: '', enabled: false });
                      })
                    }
                  >
                    {t('addLanguage')}
                  </Button>
                </div>
              )}
              {ui.tab === 'scopes' && (
                <div className='space-y-3'>
                  {document.scopes.map((scope, index) => (
                    <section key={scope} className='rounded-lg border p-4'>
                      <strong>{scope}</strong>
                      <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                        {document.locales.map((language) => (
                          <Field
                            key={language.tag}
                            label={language.name}
                            value={text(document, language.tag, 'scopes', scope)}
                            disabled={disabled}
                            onChange={(value) =>
                              draft.mutate((draft) =>
                                setText(draft.document, language.tag, 'scopes', scope, value)
                              )
                            }
                          />
                        ))}
                      </div>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={disabled}
                        onClick={() =>
                          execute(() => {
                            if (
                              Object.keys(document.resource_catalog.resources).some((key) =>
                                key.startsWith(`${scope}:`)
                              )
                            )
                              throw new Error('scopeInUse');
                            draft.mutate((draft) => {
                              draft.document.scopes.splice(index, 1);
                              for (const language of document.locales)
                                assign(
                                  draft.document.messages,
                                  [language.tag, 'frontend', 'scopes', scope],
                                  undefined
                                );
                            });
                          })
                        }
                      >
                        {t('delete')}
                      </Button>
                    </section>
                  ))}
                  <div className='space-y-2'>
                    <div className='flex gap-2'>
                      <Input
                        value={newScope}
                        disabled={disabled}
                        aria-label={t('scopeKey')}
                        aria-invalid={!!scopeIssue}
                        aria-describedby='new-scope-feedback'
                        placeholder={t('scopeKey')}
                        autoCapitalize='none'
                        spellCheck={false}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          const value = input.value;
                          const cursor = input.selectionStart;
                          const normalized = normalizeScopeIdentifier(value);
                          draft.mutate((draft) => { draft.ui.newScope = normalized; });
                          if (value !== normalized) {
                            input.value = normalized;
                            if (cursor !== null) {
                              const position = normalizeScopeIdentifier(value.slice(0, cursor)).length;
                              input.setSelectionRange(position, position);
                            }
                          }
                          setScopeIssue('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addScope();
                          }
                        }}
                      />
                      <Button type='button' disabled={disabled} onClick={addScope}>
                        {t('addScope')}
                      </Button>
                    </div>
                    <p id='new-scope-feedback' role={scopeIssue ? 'alert' : undefined} className={scopeIssue ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                      {t(scopeIssue || 'scopeIdentifierHint')}
                    </p>
                  </div>
                </div>
              )}
              {ui.tab === 'resources' && (
                <div className='grid min-h-[32rem] gap-5 lg:grid-cols-[18rem_1fr]'>
                  <aside className='space-y-3 rounded-lg border p-3'>
                    <StyledSelect
                      ariaLabel={pick('Scope', '作用域')}
                      value={ui.scope}
                      onChange={(scope) =>
                        navigate(() =>
                          draft.mutate((draft) => {
                            draft.ui.scope = scope;
                            draft.ui.resource = '';
                          })
                        )
                      }
                      options={document.scopes.map((value) => ({
                        value,
                        label: label('scopes', value)
                      }))}
                    />
                    <Input
                      value={ui.query}
                      placeholder={t('searchResources')}
                      onChange={(event) =>
                        draft.mutate((draft) => {
                          draft.ui.query = event.target.value;
                        })
                      }
                    />
                    <Button type='button' disabled={disabled} onClick={() => openNode()}>
                      {t('addDirectory')}
                    </Button>
                    <div className='max-h-[38rem] overflow-auto'>{nodeTree()}</div>
                  </aside>
                  <section className='min-w-0 space-y-4'>
                    {node && (
                      <>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h2 className='mr-auto text-xl font-semibold'>
                            {label('resources', ui.resource)}
                          </h2>
                          <Badge>
                            {node.kind === 'directory' ? t('directory') : t('resource')}
                          </Badge>
                          <Button
                            type='button'
                            variant='outline'
                            disabled={disabled}
                            onClick={() => openNode(ui.resource)}
                          >
                            {t('edit')}
                          </Button>
                          {node.kind === 'directory' && (
                            <Button
                              type='button'
                              disabled={disabled}
                              onClick={() => openNode('', ui.resource)}
                            >
                              {t('addResource')}
                            </Button>
                          )}
                          <Button
                            type='button'
                            variant='outline'
                            disabled={disabled}
                            onClick={() => {
                              setMoveKey(ui.resource);
                              setMoveParent(node.parent ?? '');
                            }}
                          >
                            {t('moveTo')}
                          </Button>
                          {[-1, 1].map((direction) => (
                            <Button
                              type='button'
                              variant='outline'
                              key={direction}
                              disabled={
                                disabled ||
                                !resourceStep(document, ui.resource, direction as -1 | 1)
                              }
                              onClick={() => {
                                const destination = resourceStep(
                                  document,
                                  ui.resource,
                                  direction as -1 | 1
                                );
                                if (destination) move(ui.resource, destination);
                              }}
                            >
                              {direction < 0 ? '↑' : '↓'}
                            </Button>
                          ))}
                          <Button
                            type='button'
                            variant='destructive'
                            disabled={disabled}
                            onClick={() => setConfirm('node')}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                        <code className='block break-all text-sm'>{ui.resource}</code>
                        <div className='grid gap-3 sm:grid-cols-2'>
                          <div className='rounded-lg border p-3'>
                            {t('parent')}: {node.parent ? label('resources', node.parent) : '—'}
                          </div>
                          <div className='rounded-lg border p-3'>
                            {t('sort')}: {node.sort}
                          </div>
                        </div>
                        {node.kind === 'directory' && (
                          <ReferenceList
                            catalog={document}
                            owner={ui.resource}
                            disabled={disabled}
                            label={label}
                            onChange={(next) =>
                              draft.mutate((draft) => {
                                draft.document = next;
                              })
                            }
                          />
                        )}
                        {node.entries && (
                          <div className='space-y-2'>
                            <h3 className='font-medium'>{t('entries')}</h3>
                            {Object.entries(node.entries).map(([key, entry]) => (
                              <div className='rounded-lg border p-3' key={key}>
                                <code className='block break-all'>{key}</code>
                                <p>{entry.path}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {Object.entries(node.operations ?? {}).map(([operation, binding]) => (
                          <section key={operation} className='rounded-lg border p-4'>
                            <h3 className='font-medium'>{label('operations', operation)}</h3>
                            {binding.button_keys.map((feature) => (
                              <details key={feature} className='mt-3 rounded border p-3'>
                                <summary>{label('features', feature)}</summary>
                                <pre className='mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs'>
                                  {JSON.stringify(
                                    document.resource_catalog.buttons[feature],
                                    null,
                                    2
                                  )}
                                </pre>
                              </details>
                            ))}
                          </section>
                        ))}
                      </>
                    )}
                    {ui.resourceEditor && (
                      <NodeEditor
                        key={ui.resourceEditor.original || 'new'}
                        catalog={document}
                        value={ui.resourceEditor}
                        disabled={disabled}
                        onChange={(value) =>
                          draft.mutate((draft) => {
                            draft.ui.resourceEditor = value;
                          })
                        }
                        onCancel={() =>
                          navigate(() =>
                            draft.mutate((draft) => {
                              draft.ui.resourceEditor = null;
                            })
                          )
                        }
                        onSave={() =>
                          execute(() => {
                            const next = applyResourceEditor(
                              document,
                              ui.scope,
                              ui.resourceEditor!,
                              ui.resourceRenames
                            );
                            draft.mutate((draft) => {
                              draft.document = next;
                              draft.ui.resource = ui.resourceEditor!.key;
                              draft.ui.resourceEditor = null;
                            });
                          })
                        }
                      />
                    )}
                  </section>
                </div>
              )}
              {ui.tab === 'groups' && <GroupWorkspace workspace={draft} />}
              {ui.tab === 'messages' && (
                <div className='space-y-4'>
                  <div className='flex flex-wrap gap-3'>
                    <StyledSelect
                      value={ui.category}
                      onChange={(category) =>
                        draft.mutate((draft) => {
                          draft.ui.category = category;
                          draft.ui.messagePage = 1;
                        })
                      }
                      options={['frontend', 'backend'].map((value) => ({
                        value,
                        label: value === 'frontend' ? t('frontend') : t('backend')
                      }))}
                    />
                    <Input
                      placeholder={t('searchMessages')}
                      value={ui.messageQuery}
                      onChange={(event) =>
                        draft.mutate((draft) => {
                          draft.ui.messageQuery = event.target.value;
                          draft.ui.messagePage = 1;
                        })
                      }
                    />
                    <label className='flex items-center gap-2'>
                      <Switch
                        checked={ui.missingOnly}
                        onCheckedChange={(value) =>
                          draft.mutate((draft) => {
                            draft.ui.missingOnly = value;
                          })
                        }
                      />
                      {t('missingOnly')}
                    </label>
                  </div>
                  {[
                    ...new Set(
                      document.locales.flatMap((language) =>
                        messagePaths(at(document.messages, [language.tag, ui.category])).map(
                          (path) => path.join('.')
                        )
                      )
                    )
                  ]
                    .filter(
                      (path) =>
                        (!ui.messageQuery ||
                          path.toLowerCase().includes(ui.messageQuery.toLowerCase())) &&
                        (!ui.missingOnly ||
                          document.locales.some(
                            (language) =>
                              !at(document.messages, [
                                language.tag,
                                ui.category,
                                ...path.split('.')
                              ])
                          ))
                    )
                    .slice((ui.messagePage - 1) * 20, ui.messagePage * 20)
                    .map((path) => (
                      <section key={path} className='rounded-lg border p-4'>
                        <code>{path}</code>
                        <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                          {document.locales.map((language) => (
                            <Field
                              key={language.tag}
                              label={language.name}
                              value={String(
                                at(document.messages, [
                                  language.tag,
                                  ui.category,
                                  ...path.split('.')
                                ]) ?? ''
                              )}
                              disabled={disabled}
                              onChange={(value) =>
                                draft.mutate((draft) =>
                                  assign(
                                    draft.document.messages,
                                    [language.tag, ui.category, ...path.split('.')],
                                    value
                                  )
                                )
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  <div className='flex justify-between'>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={ui.messagePage <= 1}
                      onClick={() =>
                        draft.mutate((draft) => {
                          draft.ui.messagePage--;
                        })
                      }
                    >
                      {t('previous')}
                    </Button>
                    <span>{ui.messagePage}</span>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() =>
                        draft.mutate((draft) => {
                          draft.ui.messagePage++;
                        })
                      }
                    >
                      {t('next')}
                    </Button>
                  </div>
                  <div className='flex gap-2'>
                    <Input
                      value={messageKey}
                      placeholder={t('messageKey')}
                      onChange={(event) => setMessageKey(event.target.value)}
                    />
                    <Button
                      type='button'
                      disabled={disabled}
                      onClick={() =>
                        execute(() => {
                          if (!messageKey.trim()) throw new Error('required');
                          draft.mutate((draft) => {
                            for (const language of draft.document.locales)
                              assign(
                                draft.document.messages,
                                [language.tag, ui.category, ...messageKey.split('.')],
                                ''
                              );
                          });
                          setMessageKey('');
                        })
                      }
                    >
                      {t('addMessage')}
                    </Button>
                  </div>
                </div>
              )}
              {ui.tab === 'diff' && (
                <div className='space-y-4'>
                  <div className='flex gap-2'>
                    <Button type='button' variant='outline' onClick={() => void draft.refresh()}>
                      {t('fetchOnline')}
                    </Button>
                    <Button type='button' disabled={disabled} onClick={() => draft.rebase()}>
                      {t('mergeOnline')}
                    </Button>
                    <Button type='button' variant='outline' onClick={exportDraft}>
                      {t('exportDraft')}
                    </Button>
                  </div>
                  {draft.problems.map((problem, index) => (
                    <div
                      key={index}
                      role='alert'
                      className={problem.warning ? 'text-amber-600' : 'text-destructive'}
                    >
                      {t(problem.code)}: {problem.path.join(' / ')}
                    </div>
                  ))}
                  {draft.conflicts.map((conflict, index) => (
                    <section key={index} className='rounded-lg border border-amber-500 p-4'>
                      <h3>
                        {t('conflicts')}: {conflict.path.join(' / ')}
                      </h3>
                      <div className='grid gap-3 sm:grid-cols-2'>
                        {[
                          ['local', conflict.after],
                          ['online', conflict.before]
                        ].map(([kind, value]) => (
                          <div key={String(kind)}>
                            <pre className='max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs'>
                              {JSON.stringify(value, null, 2)}
                            </pre>
                            <Button
                              type='button'
                              disabled={disabled}
                              onClick={() => draft.resolve(conflict.path, value)}
                            >
                              {t(kind === 'local' ? 'useLocal' : 'useOnline')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                  {draft.changes.map((change, index) => (
                    <details className='rounded-lg border p-3' key={index}>
                      <summary className='cursor-pointer'>
                        {change.kind} · {change.path.join(' / ')}
                      </summary>
                      <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                        <pre className='max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs'>
                          {JSON.stringify(change.before, null, 2)}
                        </pre>
                        <pre className='max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs'>
                          {JSON.stringify(change.after, null, 2)}
                        </pre>
                      </div>
                    </details>
                  ))}
                  {!draft.changes.length && <p>{t('noChanges')}</p>}
                </div>
              )}
              <footer className='flex flex-wrap justify-between gap-3 border-t pt-3 text-sm text-muted-foreground'>
                <span>{t('localOnlyHint')}</span>
                <span>
                  {t('pending')} {draft.pending.length} · {t('errors')} {errors.length} ·{' '}
                  {t('conflicts')} {draft.conflicts.length}
                </span>
              </footer>
            </>
          )
        )}
      </div>
      <AdminDrawer open={info} title={t('localDraft')} onClose={() => setInfo(false)}>
        <div className='space-y-4'>
          <p>{t('storageIsolation')}</p>
          <Button type='button' variant='outline' onClick={exportDraft}>
            {t('exportDraft')}
          </Button>
          <Button type='button' disabled={disabled} onClick={() => file.current?.click()}>
            {t('import')}
          </Button>
          <input
            hidden
            ref={file}
            type='file'
            accept='.json,application/json'
            data-testid='import-catalog-draft'
            onChange={(event) => {
              void importDraft(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button
            type='button'
            variant='destructive'
            disabled={disabled}
            onClick={() => setConfirm('discard')}
          >
            {t('discardDraft')}
          </Button>
        </div>
      </AdminDrawer>
      <AdminDrawer
        open={!!moveKey}
        title={t('moveTo')}
        onClose={() => setMoveKey('')}
        footer={
          <Button
            type='button'
            disabled={disabled || !document || !canMoveResource(document, moveKey, moveParent)}
            onClick={() => {
              move(moveKey, { parent: moveParent });
              setMoveKey('');
            }}
          >
            {t('moveTo')}
          </Button>
        }
      >
        {document && (
          <StyledSelect
            value={moveParent}
            onChange={setMoveParent}
            options={[
              { value: '', label: t('root') },
              ...Object.entries(document.resource_catalog.resources)
                .filter(([, node]) => node.kind === 'directory')
                .map(([value]) => ({ value, label: label('resources', value) }))
            ]}
          />
        )}
      </AdminDrawer>
      <AdminConfirm
        open={!!confirm}
        title={t(
          confirm === 'publish'
            ? 'submitConfirm'
            : confirm === 'leave'
              ? 'unsavedNodeTitle'
              : 'discardConfirm'
        )}
        busy={draft.publishing}
        onClose={() => setConfirm(undefined)}
        onConfirm={() => {
          if (confirm === 'publish') {
            void draft.publish();
          } else if (confirm === 'discard') draft.discard();
          else if (confirm === 'leave') {
            draft.mutate((draft) => {
              draft.ui.resourceEditor = null;
              draft.ui.groupEditor = null;
            });
            pendingNavigation?.();
          } else if (confirm === 'node' && document && ui)
            execute(() => {
              const next = clone(document);
              delete next.resource_catalog.resources[ui.resource];
              const problems = validate(next).filter((problem) => !problem.warning);
              if (problems.length) throw new Error(problems[0]!.code);
              draft.mutate((draft) => {
                draft.document = next;
                draft.ui.resource = '';
              });
            });
          setConfirm(undefined);
        }}
      />
    </PageContainer>
  );
}
function Field({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <label className='block min-w-0 space-y-2 text-sm'>
      <span>{label}</span>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Lines({
  label,
  values,
  onChange,
  disabled
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <label className='block space-y-2 text-sm'>
      <span>{label}</span>
      <Textarea
        className='max-h-40 overflow-auto font-mono text-xs'
        aria-label={label}
        disabled={disabled}
        value={values.join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    </label>
  );
}
function ReferenceList({
  catalog,
  owner,
  disabled,
  label,
  onChange
}: {
  catalog: Catalog;
  owner: string;
  disabled: boolean;
  label: (kind: string, key: string) => string;
  onChange: (catalog: Catalog) => void;
}) {
  const { pick } = useLocale();
  const [target, setTarget] = useState('');
  const node = catalog.resource_catalog.resources[owner]!;
  const options = Object.keys(catalog.resource_catalog.resources).filter((key) =>
    canReferenceResource(catalog.resource_catalog, owner, key)
  );
  return (
    <section className='space-y-3 rounded-lg border p-4'>
      <h3 className='font-medium'>{pick('References', '引用')}</h3>
      {(node.references ?? []).map((key) => (
        <div key={key} className='space-y-2 rounded border p-3'>
          <div className='flex gap-2'>
            <span className='mr-auto'>{label('resources', key)}</span>
            {[-1, 1].map((direction) => (
              <Button
                key={direction}
                type='button'
                variant='outline'
                disabled={disabled || !referenceStep(catalog, owner, key, direction as -1 | 1)}
                onClick={() => {
                  const destination = referenceStep(catalog, owner, key, direction as -1 | 1);
                  if (destination && !disabled) onChange(moveReference(catalog, owner, key, destination));
                }}
              >
                {direction < 0 ? '↑' : '↓'}
              </Button>
            ))}
            <Button
              type='button'
              variant='outline'
              disabled={disabled}
              onClick={() => {
                const next = clone(catalog);
                const node = next.resource_catalog.resources[owner]!;
                node.references = node.references?.filter((value) => value !== key);
                delete node.reference_operations?.[key];
                storeResourceOrder(
                  next.resource_catalog,
                  owner,
                  resourceChildren(next.resource_catalog, owner, owner.split(':')[0]!)
                );
                onChange(next);
              }}
            >
              {pick('Remove', '移除')}
            </Button>
          </div>
          <div className='flex flex-wrap gap-3'>
            {availableReferenceOperations(catalog.resource_catalog, key).map((operation) => (
              <label key={operation} className='flex items-center gap-2'>
                <Checkbox
                  disabled={disabled}
                  checked={(
                    node.reference_operations?.[key] ??
                    availableReferenceOperations(catalog.resource_catalog, key)
                  ).includes(operation)}
                  onCheckedChange={(checked) => {
                    const next = clone(catalog);
                    const node = next.resource_catalog.resources[owner]!;
                    const current =
                      node.reference_operations?.[key] ??
                      availableReferenceOperations(catalog.resource_catalog, key);
                    (node.reference_operations ??= {})[key] = checked
                      ? [...current, operation]
                      : current.filter((value) => value !== operation);
                    onChange(next);
                  }}
                />
                {label('operations', operation)}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className='flex gap-2'>
        <StyledSelect
          value={target}
          onChange={setTarget}
          options={[
            { value: '', label: pick('Choose resource or directory', '选择资源或目录') },
            ...options.map((value) => ({ value, label: label('resources', value) }))
          ]}
        />
        <Button
          type='button'
          disabled={disabled || !target}
          onClick={() => {
            const next = clone(catalog);
            const node = next.resource_catalog.resources[owner]!;
            node.references = [...new Set([...(node.references ?? []), target])];
            (node.reference_operations ??= {})[target] = availableReferenceOperations(
              catalog.resource_catalog,
              target
            );
            onChange(next);
            setTarget('');
          }}
        >
          {pick('Add reference', '添加引用')}
        </Button>
      </div>
    </section>
  );
}
function NodeEditor({
  catalog,
  value,
  disabled,
  onChange,
  onCancel,
  onSave
}: {
  catalog: Catalog;
  value: ResourceEditorModel;
  disabled: boolean;
  onChange: (value: ResourceEditorModel) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { pick } = useLocale();
  const [tab, setTab] = useState(value.editorTab ?? 'basic');
  const [issue, setIssue] = useState('');
  const update = (changes: Partial<ResourceEditorModel>) => onChange({ ...value, ...changes });
  return (
    <section className='space-y-4 rounded-lg border bg-card p-5' data-testid='resource-node-editor'>
      <h3 className='text-lg font-medium'>
        {value.original ? pick('Edit node', '编辑节点') : pick('New node', '新建节点')}
      </h3>
      <div className='flex gap-2'>
        {[
          ['basic', pick('Basic', '基本信息')],
          ['entries', pick('Menu entries', '菜单入口')],
          ['operations', pick('Operations and features', '操作与功能')]
        ].map(([key, title]) => (
          <Button
            type='button'
            variant={tab === key ? 'default' : 'outline'}
            key={key}
            onClick={() => {
              setTab(key as typeof tab);
              update({ editorTab: key as typeof value.editorTab });
            }}
          >
            {title}
          </Button>
        ))}
      </div>
      {issue && (
        <p role='alert' className='text-destructive'>
          {issue}
        </p>
      )}
      {tab === 'basic' && (
        <div className='space-y-4'>
          <Field
            label={pick('Identifier', '标识')}
            value={value.key}
            disabled={disabled || !!value.original}
            onChange={(key) => update({ key })}
          />
          <StyledSelect
            ariaLabel={pick('Type', '类型')}
            value={value.nodeKind}
            onChange={(kind) => {
              const target = kind as 'resource' | 'directory';
              const problem = resourceTypeChangeIssue(catalog, value, target);
              if (problem) setIssue(problem);
              else {
                update({ nodeKind: target });
                setIssue('');
              }
            }}
            options={[
              { value: 'directory', label: pick('Directory', '目录') },
              { value: 'resource', label: pick('Resource', '资源') }
            ]}
          />
          <StyledSelect
            ariaLabel={pick('Parent', '父级')}
            value={value.parent}
            onChange={(parent) => update({ parent })}
            options={[
              { value: '', label: pick('Root', '根目录') },
              ...Object.entries(catalog.resource_catalog.resources)
                .filter(
                  ([key, node]) =>
                    node.kind === 'directory' &&
                    key !== value.original &&
                    key.startsWith(`${value.key.split(':')[0]}:`)
                )
                .map(([key]) => ({
                  value: key,
                  label: text(catalog, 'zh-CN', 'resources', key) || key
                }))
            ]}
          />
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field
              label='中文'
              value={value.zh}
              disabled={disabled}
              onChange={(zh) => update({ zh })}
            />
            <Field
              label='English'
              value={value.en}
              disabled={disabled}
              onChange={(en) => update({ en })}
            />
            <Field
              label={pick('Position', '位置')}
              type='number'
              value={String(value.position ?? 1)}
              disabled={disabled}
              onChange={(position) => update({ position: Number(position) })}
            />
          </div>
          <label className='flex items-center gap-2'>
            <Switch
              disabled={disabled}
              checked={value.frontendVisible !== false}
              onCheckedChange={(frontendVisible) => update({ frontendVisible })}
            />
            {pick('Visible in navigation', '在导航中显示')}
          </label>
          {value.nodeKind === 'resource' && (
            <label className='flex items-center gap-2'>
              <Switch
                disabled={disabled}
                checked={value.permissionScope === '*'}
                onCheckedChange={(all) =>
                  update({
                    permissionScope: all ? '*' : '',
                    operations: all ? [] : value.operations
                  })
                }
              />
              {pick('All permission scopes', '全部权限作用域')}
            </label>
          )}
        </div>
      )}
      {tab === 'entries' && (
        <div className='space-y-4'>
          {value.entries.map((entry, index) => (
            <div key={index} className='space-y-3 rounded border p-4'>
              <Field
                label={pick('Menu key', '菜单标识')}
                value={entry.key}
                disabled={disabled}
                onChange={(key) =>
                  update({
                    entries: value.entries.map((item, i) => (i === index ? { ...item, key } : item))
                  })
                }
              />
              <Field
                label={pick('Path', '路径')}
                value={entry.path}
                disabled={disabled}
                onChange={(path) =>
                  update({
                    entries: value.entries.map((item, i) =>
                      i === index ? { ...item, path } : item
                    )
                  })
                }
              />
              <Field
                label={pick('Parent menu key', '父菜单标识')}
                value={entry.parentMenu}
                disabled={disabled}
                onChange={(parentMenu) =>
                  update({
                    entries: value.entries.map((item, i) =>
                      i === index ? { ...item, parentMenu } : item
                    )
                  })
                }
              />
              <div className='flex gap-3'>
                {permissionOperations.map((operation) => (
                  <label className='flex items-center gap-2' key={operation}>
                    <Checkbox
                      checked={entry.operations.includes(operation)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        update({
                          entries: value.entries.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  operations: checked
                                    ? [...item.operations, operation]
                                    : item.operations.filter((key) => key !== operation)
                                }
                              : item
                          )
                        })
                      }
                    />
                    {operation}
                  </label>
                ))}
              </div>
              <Button
                type='button'
                variant='outline'
                disabled={disabled}
                onClick={() => update({ entries: value.entries.filter((_, i) => i !== index) })}
              >
                {pick('Remove', '移除')}
              </Button>
            </div>
          ))}
          <Button
            type='button'
            disabled={disabled || value.nodeKind !== 'resource'}
            onClick={() =>
              update({
                entries: [
                  ...value.entries,
                  {
                    key: `${value.key.replace(':', ':menu:')}`,
                    path: '/',
                    parentMenu: '',
                    operations: ['read']
                  }
                ]
              })
            }
          >
            {pick('Add menu entry', '添加菜单入口')}
          </Button>
        </div>
      )}
      {tab === 'operations' && (
        <div className='space-y-4'>
          <div className='flex gap-3'>
            {permissionOperations.map((operation) => (
              <label key={operation} className='flex items-center gap-2'>
                <Checkbox
                  checked={value.operations.includes(operation)}
                  disabled={
                    disabled || value.nodeKind !== 'resource' || value.permissionScope === '*'
                  }
                  onCheckedChange={(checked) =>
                    update({
                      operations: checked
                        ? [...value.operations, operation]
                        : value.operations.filter((key) => key !== operation),
                      ...(checked
                        ? {}
                        : {
                            features: value.features.filter(
                              (feature) => feature.operation !== operation
                            )
                          })
                    })
                  }
                />
                {operation}
              </label>
            ))}
          </div>
          {value.features.map((feature, index) => {
            const updateFeature = (changes: Partial<typeof feature>) =>
              update({
                features: value.features.map((item, i) =>
                  i === index ? { ...item, ...changes } : item
                )
              });
            return (
              <div key={index} className='space-y-4 rounded-lg border p-4'>
                <StyledSelect
                  value={feature.operation}
                  onChange={(operation) => updateFeature({ operation })}
                  options={value.operations.map((value) => ({ value, label: value }))}
                />
                <Field
                  label={pick('Feature key', '功能标识')}
                  value={feature.key}
                  disabled={disabled}
                  onChange={(key) => updateFeature({ key })}
                />
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field
                    label='中文'
                    value={feature.zh}
                    disabled={disabled}
                    onChange={(zh) => updateFeature({ zh })}
                  />
                  <Field
                    label='English'
                    value={feature.en}
                    disabled={disabled}
                    onChange={(en) => updateFeature({ en })}
                  />
                </div>
                <Field
                  label={pick('Permission resource', '授权管理资源')}
                  value={feature.permissionResource ?? ''}
                  disabled={disabled}
                  onChange={(permissionResource) => updateFeature({ permissionResource })}
                />
                <Lines
                  label={pick('Frontend buttons', '前端按钮')}
                  values={feature.buttons}
                  disabled={disabled}
                  onChange={(buttons) => updateFeature({ buttons })}
                />
                <Lines
                  label={pick('Menu entry keys', '菜单入口标识')}
                  values={feature.entryKeys ?? []}
                  disabled={disabled}
                  onChange={(entryKeys) => updateFeature({ entryKeys })}
                />
                <div className='space-y-2'>
                  <Label>HTTP</Label>
                  {feature.http.map((endpoint, httpIndex) => (
                    <div key={httpIndex} className='flex gap-2'>
                      <StyledSelect
                        value={endpoint.method}
                        options={['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].map((value) => ({
                          value,
                          label: value
                        }))}
                        onChange={(method) =>
                          updateFeature({
                            http: feature.http.map((item, i) =>
                              i === httpIndex ? { ...item, method } : item
                            )
                          })
                        }
                      />
                      <Input
                        aria-label={pick('HTTP path', 'HTTP 路径')}
                        value={endpoint.path}
                        disabled={disabled}
                        onChange={(event) =>
                          updateFeature({
                            http: feature.http.map((item, i) =>
                              i === httpIndex ? { ...item, path: event.target.value } : item
                            )
                          })
                        }
                      />
                      <Button
                        type='button'
                        variant='outline'
                        disabled={disabled}
                        onClick={() =>
                          updateFeature({ http: feature.http.filter((_, i) => i !== httpIndex) })
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type='button'
                    variant='outline'
                    disabled={disabled}
                    onClick={() =>
                      updateFeature({ http: [...feature.http, { method: 'GET', path: '/' }] })
                    }
                  >
                    {pick('Add HTTP endpoint', '添加 HTTP 接口')}
                  </Button>
                </div>
                <Lines
                  label='gRPC'
                  values={feature.grpc}
                  disabled={disabled}
                  onChange={(grpc) => updateFeature({ grpc })}
                />
                <Button
                  type='button'
                  variant='destructive'
                  disabled={disabled}
                  onClick={() => update({ features: value.features.filter((_, i) => i !== index) })}
                >
                  {pick('Remove feature', '移除功能')}
                </Button>
              </div>
            );
          })}
          <Button
            type='button'
            disabled={disabled || !value.operations.length}
            onClick={() =>
              update({
                features: [
                  ...value.features,
                  {
                    key: `${value.key}:`,
                    zh: '',
                    en: '',
                    operation: value.operations[0]!,
                    buttons: [],
                    http: [],
                    grpc: [],
                    entryKeys: []
                  }
                ]
              })
            }
          >
            {pick('Add feature', '添加功能')}
          </Button>
        </div>
      )}
      <footer className='flex justify-end gap-2 border-t pt-4'>
        <Button type='button' variant='outline' onClick={onCancel}>
          {pick('Cancel', '取消')}
        </Button>
        <Button type='button' disabled={disabled} onClick={onSave}>
          {pick('Save to local draft', '保存到本地草稿')}
        </Button>
      </footer>
    </section>
  );
}

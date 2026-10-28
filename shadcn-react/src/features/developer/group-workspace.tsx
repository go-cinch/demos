'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/features/i18n/locale-context';
import { request } from '@/features/auth/api';
import { AdminConfirm } from '@/features/system/components/admin-ui';
import {
  changePermissionGroup,
  groupNames,
  groupWords,
  recordGroupRename,
  removePermissionGroup,
  pendingGroupRenames
} from '@/features/permissions/action-group-model';
import type { useCatalogDraft } from './use-catalog-draft';
import { text } from './catalog-model';
export default function GroupWorkspace({
  workspace
}: {
  workspace: ReturnType<typeof useCatalogDraft>;
}) {
  const { pick, locale } = useLocale();
  const state = workspace.draft!;
  const document = state.document;
  const ui = state.ui;
  const [usage, setUsage] = useState<{ name: string; count: number }[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [issue, setIssue] = useState('');
  const [remove, setRemove] = useState('');
  useEffect(() => {
    if (ui.groupEditor) return;
    let active = true;
    const refresh = () => {
      setLoading(true);
      void request<{ groups: { name: string; count: number }[] }>('/action/summary?f=groups')
        .then((result) => {
          if (active) {
            setUsage(result.groups);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      void workspace.refresh().then((online) => {
        if (active && online) workspace.rebase(online);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [!!ui.groupEditor, revision]);
  const renames = pendingGroupRenames(state.base, document, ui.groupRenames);
  const counts = new Map<string, number>();
  for (const item of usage) {
    const word = renames[item.name] ?? item.name;
    counts.set(word, (counts.get(word) ?? 0) + item.count);
  }
  const words = [
    ...new Set([...(document.group_order ?? []), ...groupWords(document), ...counts.keys()])
  ];
  const selected = words.includes(ui.group) ? ui.group : words[0];
  const title = (word: string) =>
    text(document, locale, 'groups', word) ||
    text(document, document.default_locale, 'groups', word) ||
    word;
  const disabled = !workspace.canEdit || loading || failed;
  function edit(word = '') {
    workspace.mutate((draft) => {
      draft.ui.groupEditor = {
        original: word,
        word: word || `${ui.scope}:system:`,
        names: word ? groupNames(document, word) : {},
        isDefault: !!document.group_defaults?.[word],
        attempted: false
      };
    });
  }
  return (
    <div className='grid gap-5 md:grid-cols-[16rem_1fr]'>
      <aside className='space-y-3 rounded-lg border p-3'>
        <Button
          type='button'
          disabled={disabled || !!ui.groupEditor}
          className='w-full'
          onClick={() => edit()}
        >
          {pick('Create group', '新建分组')}
        </Button>
        {words.map((word, index) => (
          <div
            key={word}
            className='flex items-center gap-1'
            draggable={!disabled && !ui.groupEditor}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', word)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (disabled) return;
              const from = event.dataTransfer.getData('text/plain');
              if (!words.includes(from)) return;
              const order = words.filter((key) => key !== from);
              order.splice(order.indexOf(word), 0, from);
              workspace.mutate((draft) => {
                draft.document.group_order = order;
              });
            }}
          >
            <Button
              type='button'
              className='h-auto min-h-10 flex-1 justify-between whitespace-normal text-start'
              variant={selected === word ? 'secondary' : 'ghost'}
              disabled={!!ui.groupEditor}
              onClick={() =>
                workspace.mutate((draft) => {
                  draft.ui.group = word;
                })
              }
            >
              {title(word)}
              <Badge variant='outline'>{counts.get(word) ?? 0}</Badge>
            </Button>
            {[-1, 1].map((direction) => (
              <Button
                key={direction}
                type='button'
                variant='ghost'
                size='sm'
                aria-label={pick(
                  direction < 0 ? 'Move up' : 'Move down',
                  direction < 0 ? '上移' : '下移'
                )}
                disabled={disabled || !!ui.groupEditor || !words[index + direction]}
                onClick={() =>
                  workspace.mutate((draft) => {
                    const order = [...words];
                    [order[index], order[index + direction]] = [
                      order[index + direction]!,
                      order[index]!
                    ];
                    draft.document.group_order = order;
                  })
                }
              >
                {direction < 0 ? '↑' : '↓'}
              </Button>
            ))}
          </div>
        ))}
      </aside>
      <section className='space-y-4 rounded-lg border p-5'>
        {failed && (
          <div role='alert' className='text-destructive'>
            {pick('Could not load group usage', '无法加载分组使用情况')}
            <Button
              type='button'
              variant='outline'
              onClick={() => setRevision((value) => value + 1)}
            >
              {pick('Retry', '重试')}
            </Button>
          </div>
        )}
        {ui.groupEditor ? (
          <>
            <h3 className='text-lg font-semibold'>
              {pick('Edit permission group', '编辑权限分组')}
            </h3>
            <label className='block space-y-2'>
              <span>{pick('Identifier', '标识')}</span>
              <Input
                value={ui.groupEditor.word}
                onChange={(event) =>
                  workspace.mutate((draft) => {
                    draft.ui.groupEditor!.word = event.target.value;
                  })
                }
              />
            </label>
            {document.locales.map((language) => (
              <label key={language.tag} className='block space-y-2'>
                <span>{language.name}</span>
                <Input
                  value={ui.groupEditor!.names[language.tag] ?? ''}
                  onChange={(event) =>
                    workspace.mutate((draft) => {
                      draft.ui.groupEditor!.names[language.tag] = event.target.value;
                    })
                  }
                />
              </label>
            ))}
            <label className='flex items-center gap-3'>
              <Switch
                checked={ui.groupEditor.isDefault}
                onCheckedChange={(value) =>
                  workspace.mutate((draft) => {
                    draft.ui.groupEditor!.isDefault = value;
                  })
                }
              />
              {pick('Default permissions', '默认权限')}
            </label>
            <p className='text-sm text-muted-foreground'>
              {pick(
                'Default status takes effect after publishing this draft.',
                '默认状态在发布草稿后生效。'
              )}
            </p>
            {issue && (
              <p role='alert' className='text-destructive'>
                {issue}
              </p>
            )}
            <Button
              type='button'
              disabled={!workspace.canEdit}
              onClick={() => {
                try {
                  const editor = ui.groupEditor!;
                  if (!/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){2,}$/.test(editor.word))
                    throw new Error();
                  const next = changePermissionGroup(
                    document,
                    editor.original || undefined,
                    editor.word,
                    editor.names,
                    editor.isDefault
                  );
                  workspace.mutate((draft) => {
                    draft.document = next;
                    if (editor.original && editor.original !== editor.word)
                      draft.ui.groupRenames = recordGroupRename(
                        draft.ui.groupRenames,
                        editor.original,
                        editor.word
                      );
                    draft.ui.group = editor.word;
                    draft.ui.groupEditor = null;
                  });
                  setIssue('');
                } catch {
                  setIssue(
                    pick(
                      'Check the identifier and default language name.',
                      '请检查标识及默认语言名称。'
                    )
                  );
                }
              }}
            >
              {pick('Save to draft', '保存到草稿')}
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                workspace.mutate((draft) => {
                  draft.ui.groupEditor = null;
                })
              }
            >
              {pick('Cancel', '取消')}
            </Button>
          </>
        ) : selected ? (
          <>
            <header className='flex flex-wrap items-center gap-3'>
              <h3 className='mr-auto text-xl font-semibold'>{title(selected)}</h3>
              <Button
                type='button'
                variant='outline'
                disabled={disabled}
                onClick={() => edit(selected)}
              >
                {pick('Edit', '编辑')}
              </Button>
              {!failed && !loading && (counts.get(selected) ?? 0) === 0 && (
                <Button
                  type='button'
                  variant='destructive'
                  disabled={disabled}
                  onClick={() => setRemove(selected)}
                >
                  {pick('Delete group', '删除分组')}
                </Button>
              )}
            </header>
            <code className='block break-all'>{selected}</code>
            <p>
              {pick('Permissions', '权限数量')}: {counts.get(selected) ?? 0}
            </p>
            <div className='grid gap-3 sm:grid-cols-2'>
              {document.locales.map((language) => (
                <div key={language.tag} className='rounded-lg border p-3'>
                  <p className='text-xs text-muted-foreground'>{language.name}</p>
                  <p className='mt-2'>{text(document, language.tag, 'groups', selected) || '—'}</p>
                </div>
              ))}
            </div>
            <Badge>
              {document.group_defaults?.[selected]
                ? pick('Default', '默认')
                : pick('Normal', '普通')}
            </Badge>
          </>
        ) : (
          <p>{pick('No permission groups', '暂无权限分组')}</p>
        )}
      </section>
      <AdminConfirm
        open={!!remove}
        title={pick('Delete this empty group?', '删除此空分组？')}
        busy={false}
        onClose={() => setRemove('')}
        onConfirm={() => {
          if (!disabled && (counts.get(remove) ?? 0) === 0)
            workspace.mutate((draft) => {
              draft.document = removePermissionGroup(draft.document, remove);
            });
          setRemove('');
        }}
      />
    </div>
  );
}

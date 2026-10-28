/* oxlint-disable react/set-state-in-effect -- Reset form state when opening the modal. */
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/features/i18n/locale-context';
import { useAuth } from '@/features/auth/auth-context';
import { request } from '@/features/auth/api';
import { listRecords, updateRecord } from '@/features/system/api';
import { changePermissionGroup, groupWords, removePermissionGroup } from './action-group-model';
import { isCatalog, type Catalog } from '@/features/developer/catalog-model';
import { refreshCatalog, useCatalogLabels } from './catalog-context';
export async function changeGroups(change: (catalog: Catalog) => Catalog) {
  const response = await listRecords('dictionary', {
    key: 'I18N_CATALOG',
    p: 1,
    s: 100,
    f: 'id,key,value,enabled,updated_at'
  });
  const record = response.items.find((record) => record.key === 'I18N_CATALOG');
  if (!record || !isCatalog(record.value) || !record.enabled)
    throw new Error('Catalog unavailable');
  const value = change(record.value);
  await updateRecord('dictionary', record.id, { value, expected_value: record.value });
  await refreshCatalog();
}
export function GroupDialog({
  open,
  scope,
  onClose,
  onCreated
}: {
  open: boolean;
  scope: string;
  onClose: () => void;
  onCreated: (word: string) => void;
}) {
  const { pick } = useLocale();
  const { catalog } = useCatalogLabels();
  const [word, setWord] = useState(`${scope}:system:`),
    [names, setNames] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setWord(`${scope}:system:`);
      setNames({});
      setError('');
    }
  }, [open, scope]);
  async function save() {
    if (busy) return;
    if (
      !word.startsWith(`${scope}:`) ||
      !/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){2,}$/.test(word) ||
      !names[catalog?.default_locale ?? 'en-US']?.trim()
    ) {
      setError(
        pick(
          'Enter a valid identifier and a default language name.',
          '请输入有效标识及默认语言名称。'
        )
      );
      return;
    }
    setBusy(true);
    try {
      await changeGroups((catalog) => changePermissionGroup(catalog, undefined, word, names));
      onCreated(word);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : pick('Unable to save group', '无法保存分组')
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pick('Create permission group', '新建权限分组')}</DialogTitle>
        </DialogHeader>
        <label className='space-y-2'>
          <span>{pick('Identifier', '标识')}</span>
          <Input
            value={word}
            aria-invalid={!!error}
            onChange={(event) => setWord(event.target.value)}
          />
        </label>
        {(catalog?.locales ?? []).map((language) => (
          <label key={language.tag} className='space-y-2'>
            <span>{language.name}</span>
            <Input
              value={names[language.tag] ?? ''}
              onChange={(event) =>
                setNames((old) => ({ ...old, [language.tag]: event.target.value }))
              }
            />
          </label>
        ))}
        {error && (
          <p role='alert' className='text-destructive'>
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose} disabled={busy}>
            {pick('Cancel', '取消')}
          </Button>
          <Button type='button' onClick={() => void save()} disabled={busy}>
            {pick('Create', '新建')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function PermissionGroupNav({
  selected,
  onSelect,
  selectable = true,
  revision
}: {
  selected: string;
  selectable?: boolean;
  onSelect: (word: string) => void;
  revision: number;
}) {
  const { pick } = useLocale();
  const { user } = useAuth();
  const { catalog, label } = useCatalogLabels();
  const [counts, setCounts] = useState<{ name: string; count: number }[]>([]),
    [failed, setFailed] = useState(false),
    [dialog, setDialog] = useState(false),
    [error, setError] = useState('');
  const controls = user?.permission.btns ?? [];
  const manage =
    user?.permission.permission_scope === '*' ||
    user?.permission.permission_scopes?.includes('action:update');
  const can = (key: string) => !!manage && controls.includes(`admin:btn:system:action:${key}`);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void request<{ groups: { name: string; count: number }[] }>('/action/summary?f=groups')
        .then((value) => {
          if (active) {
            setCounts(value.groups);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [revision, catalog]);
  const words = [
    ...new Set([
      ...(catalog?.group_order ?? []),
      ...(catalog ? groupWords(catalog) : []),
      ...counts.map((group) => group.name)
    ])
  ];
  async function reorder(order: string[]) {
    try {
      await changeGroups((catalog) => ({ ...catalog, group_order: order }));
      setError('');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : pick('Unable to save order', '无法保存顺序')
      );
    }
  }
  return (
    <section
      className='space-y-3 rounded-lg border bg-card p-4'
      aria-label={pick('Permission groups', '权限分组')}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant={!selected ? 'default' : 'outline'}
          disabled={!selectable}
          onClick={() => { if (selectable) onSelect(''); }}
        >
          {pick('All', '全部')}{' '}
          <Badge variant='secondary'>{counts.reduce((total, item) => total + item.count, 0)}</Badge>
        </Button>
        {words.map((word, index) => (
          <div
            key={word}
            className='flex items-center gap-1 rounded-lg border p-1'
            draggable={can('reorder-groups')}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', word)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!can('reorder-groups')) return;
              const from = event.dataTransfer.getData('text/plain');
              if (!words.includes(from)) return;
              const order = words.filter((key) => key !== from);
              order.splice(order.indexOf(word), 0, from);
              void reorder(order);
            }}
          >
            <Button
              type='button'
              variant={selected === word ? 'default' : 'ghost'}
              disabled={!selectable}
              onClick={() => { if (selectable) onSelect(word); }}
            >
              {label('groups', word)}{' '}
              <Badge variant='outline'>
                {counts.find((group) => group.name === word)?.count ?? 0}
              </Badge>
            </Button>
            {can('reorder-groups') &&
              [-1, 1].map((direction) => (
                <Button
                  key={direction}
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label={pick(
                    direction < 0 ? 'Move group up' : 'Move group down',
                    direction < 0 ? '分组上移' : '分组下移'
                  )}
                  disabled={!words[index + direction]}
                  onClick={() => {
                    const order = [...words];
                    [order[index], order[index + direction]] = [
                      order[index + direction]!,
                      order[index]!
                    ];
                    void reorder(order);
                  }}
                >
                  {direction < 0 ? '↑' : '↓'}
                </Button>
              ))}
            {can('delete-group') &&
              !failed &&
              (counts.find((group) => group.name === word)?.count ?? 0) === 0 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label={pick(
                    `Delete ${label('groups', word)}`,
                    `删除${label('groups', word)}`
                  )}
                  onClick={() => {
                    void changeGroups((catalog) => removePermissionGroup(catalog, word)).catch(
                      (error) => setError(String(error))
                    );
                  }}
                >
                  ×
                </Button>
              )}
          </div>
        ))}
        {can('create-group') && (
          <Button type='button' variant='outline' onClick={() => setDialog(true)}>
            {pick('Create group', '新建分组')}
          </Button>
        )}
      </div>
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}
      <GroupDialog
        open={dialog}
        scope={selected.split(':')[0] || 'admin'}
        onClose={() => setDialog(false)}
        onCreated={onSelect}
      />
    </section>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/i18n/locale-context';
import { StyledSelect } from '@/features/system/components/record-selects';
import { useCatalogLabels } from './catalog-context';
import { groupWords } from './action-group-model';
import { GroupDialog } from './group-controls';
import { getPermissionCatalog } from './service';
import ResourceEditor from './resource-editor';
import {
  actionResourceBindings,
  resolveResourceBindings,
  resolveResourceSelectionConfig
} from './resource-catalog';
import { actionSelection } from './permission-selection';
import { actionWordPattern } from './action-config';
import type { ActionConfig, PermissionCatalog } from './types';

export default function ActionEditor({
  values,
  recordId,
  onChange,
  onValidity
}: {
  values: Record<string, unknown>;
  recordId?: number;
  onChange: (values: Record<string, unknown>) => void;
  onValidity: (value: string) => void;
}) {
  const { pick } = useLocale();
  const { catalog: translations, label } = useCatalogLabels();
  const [catalog, setCatalog] = useState<PermissionCatalog>();
  const [failed, setFailed] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false);
  const [retry, setRetry] = useState(0);
  const config = values.config as ActionConfig | undefined;
  const [automatic, setAutomatic] = useState(!recordId);
  const [scope, setScope] = useState(String(values.scope || 'admin'));
  const word = String(values.word ?? '');
  const names = (values.names ?? {}) as Record<string, string>;
  useEffect(() => {
    let active = true;
    onValidity('loading');
    getPermissionCatalog()
      .then((data) => {
        if (active) {
          setCatalog(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const selection = useMemo(() => {
    if (!catalog || !config) return [];
    try {
      return actionSelection(catalog.resource_catalog, { code: '', word: `${scope}:`, config });
    } catch {
      return actionResourceBindings(config);
    }
  }, [catalog, config, scope]);
  const problem = failed
    ? pick('Unable to load catalog', '无法加载权限目录')
    : !catalog
      ? pick('Loading catalog', '正在加载权限目录')
      : !actionWordPattern.test(word) || word.length > 128
        ? pick('Enter a valid scoped permission identifier', '请输入有效的作用域权限标识')
        : catalog.defined_actions?.some((entry) => entry.word === word && entry.id !== recordId)
          ? pick('This permission already exists', '该权限已存在')
          : word.split(':')[0] !== scope
            ? pick('Identifier and scope must match', '标识必须与作用域一致')
            : !config
              ? pick('Choose resources and operations', '请选择资源和操作')
              : '';
  useEffect(() => onValidity(problem), [problem, onValidity]);
  const groupKeys = (translations ? groupWords(translations) : [])
    .filter((key) => key.startsWith(`${scope}:`));
  return (
    <div className='space-y-5' data-testid='action-editor'>
      <GroupDialog
        open={groupDialog}
        scope={scope}
        onClose={() => setGroupDialog(false)}
        onCreated={(group) => onChange({ group })}
      />
      {failed && (
        <div role='alert'>
          {problem}
          <Button type='button' onClick={() => setRetry((value) => value + 1)}>
            {pick('Retry', '重试')}
          </Button>
        </div>
      )}
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label>{pick('Business group', '业务分组')}</Label>
          <Button type='button' variant='outline' size='sm' onClick={() => setGroupDialog(true)}>
            {pick('Create group', '新建分组')}
          </Button>
        </div>
        <StyledSelect
          value={String(values.group ?? '')}
          onChange={(group) => onChange({ group })}
          options={[
            { value: '', label: pick('Select group', '选择分组') },
            ...groupKeys.map((key) => ({ value: key, label: label('groups', key) }))
          ]}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='action-identifier'>{pick('Identifier', '标识')}</Label>
        <Input
          id='action-identifier'
          data-testid='action-word-input'
          value={word}
          aria-invalid={!!problem && !!word}
          onChange={(event) => {
            setAutomatic(false);
            onChange({ word: event.target.value });
          }}
        />
        {word && problem && (
          <p role='alert' className='text-xs text-destructive'>
            {problem}
          </p>
        )}
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        {(
          translations?.locales ?? [
            { tag: 'zh-CN', name: '中文' },
            { tag: 'en-US', name: 'English' }
          ]
        ).map((language) => (
          <div key={language.tag} className='space-y-2'>
            <Label htmlFor={`action-name-${language.tag}`}>{language.name}</Label>
            <Input
              id={`action-name-${language.tag}`}
              value={names[language.tag] ?? ''}
              placeholder={word}
              onChange={(event) =>
                onChange({ names: { ...names, [language.tag]: event.target.value } })
              }
            />
          </div>
        ))}
      </div>
      {catalog && (
        <>
          <StyledSelect
            ariaLabel={pick('Scope', '作用域')}
            value={scope}
            onChange={(value) => {
              setScope(value);
              onChange({
                scope: value,
                group: '',
                ...(automatic ? { word: '' } : {}),
                config: { bindings: [], ui: [], endpoints: [] }
              });
            }}
            options={catalog.scopes.map((value) => ({ value, label: label('scopes', value) }))}
          />
          <ResourceEditor
            key={scope}
            catalog={{ ...catalog, scopes: [scope] }}
            selection={selection}
            defaultMode={config?.builtin === 'default'}
            onChange={(bindings) => {
              const first = bindings[0];
              const generated =
                config?.builtin === 'default'
                  ? resolveResourceSelectionConfig(
                      catalog.resource_catalog,
                      scope,
                      bindings.map((binding) => binding.resource_key),
                      bindings.flatMap((binding) => binding.feature_keys ?? [])
                    )
                  : resolveResourceBindings(catalog.resource_catalog, scope, bindings);
              onChange({
                config: generated,
                ...(automatic && first
                  ? {
                      word: `${scope}:${first.operation === '*' ? 'all' : first.operation}:${first.resource_key.split(':').slice(1).join(':')}`
                    }
                  : {})
              });
            }}
          />
        </>
      )}
    </div>
  );
}

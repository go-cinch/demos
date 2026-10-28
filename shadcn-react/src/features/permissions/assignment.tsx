/* oxlint-disable react/set-state-in-effect -- Reset async catalog state when the controlled record changes. */
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/i18n/locale-context';
import ResourceEditor from './resource-editor';
import { getPermissionCatalog, hydrateActions } from './service';
import { actionSelection, normalizeSelection, selectionFingerprint } from './permission-selection';
import type { ActionResourceBinding, PermissionCatalog } from './types';

export default function PermissionAssignment({
  codes,
  onChange,
  onValidity
}: {
  codes: string[];
  onChange: (value: ActionResourceBinding[] | undefined) => void;
  onValidity: (value: string) => void;
}) {
  const { pick } = useLocale();
  const [catalog, setCatalog] = useState<PermissionCatalog>();
  const [selection, setSelection] = useState<ActionResourceBinding[]>([]);
  const [original, setOriginal] = useState('');
  const [missing, setMissing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = codes.join(',');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    onValidity('loading');
    Promise.all([getPermissionCatalog(), hydrateActions(key.split(',').filter(Boolean))])
      .then(([document, actions]) => {
        if (!active) return;
        const codes = key.split(',').filter(Boolean);
        const initial = normalizeSelection(
          document.resource_catalog,
          codes
            .filter((code) => actions.has(code))
            .flatMap((code) => actionSelection(document.resource_catalog, actions.get(code)!))
        );
        const missing = codes.filter((code) => !actions.has(code)).length;
        setCatalog(document);
        setSelection(initial);
        setOriginal(selectionFingerprint(initial));
        setMissing(missing);
        if (missing) onChange(initial);
        onValidity('');
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          onValidity('error');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, retry]);
  return (
    <div data-testid='association-action' className='space-y-3' aria-busy={loading}>
      {failed && (
        <p role='alert' className='text-destructive'>
          {pick('Unable to load permission catalog', '无法加载权限目录')}{' '}
          <Button type='button' variant='outline' onClick={() => setRetry((value) => value + 1)}>
            {pick('Retry', '重试')}
          </Button>
        </p>
      )}
      {missing > 0 && (
        <p role='status'>
          {pick(
            `${missing} revoked definitions will be removed when saved.`,
            `${missing} 个已撤销权限定义将在保存时移除。`
          )}
        </p>
      )}
      {loading ? (
        <div className='h-64 animate-pulse rounded-lg bg-muted' />
      ) : (
        catalog &&
        !failed && (
          <ResourceEditor
            catalog={catalog}
            assignment
            selection={selection}
            onChange={(next) => {
              setSelection(next);
              onChange(!missing && selectionFingerprint(next) === original ? undefined : next);
            }}
          />
        )
      )}
    </div>
  );
}

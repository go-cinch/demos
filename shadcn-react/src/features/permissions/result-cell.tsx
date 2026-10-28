'use client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdminText } from '@/features/system/components/admin-ui';
import { useCatalogLabels } from './catalog-context';
import { permissionResult } from './permission-result';
import type { ActionConfig } from './types';
export default function PermissionResultCell({ config, field, onDetail }: {
  config?: ActionConfig; field: string; matrix?: boolean; onDetail?: () => void;
}) {
  const { label } = useCatalogLabels();
  const text = useAdminText();
  const result = permissionResult(config);
  const kind = field === 'menu' ? 'menus' : field === 'resource' ? 'operations' : 'features';
  const keys = result[kind];
  const fallback = !result.available || (field === 'button' && !result.featuresKnown && !result.all)
    ? 'permission-display.unavailable'
    : result.all ? `permission-display.${field === 'menu' ? 'allMenus' : field === 'resource' ? 'allOperations' : 'allFeatures'}`
    : field === 'menu' ? 'permission-display.noResource' : field === 'button' ? 'permission-display.noFeatures' : 'action-editor.noSelectedOperations';
  if (result.all) return <Badge data-permission-result={field} variant='outline' className='text-red-600'>{text(fallback)}</Badge>;
  if (!keys.length || (field === 'button' && !result.featuresKnown))
    return <span data-permission-result={field} className='text-xs text-muted-foreground'>{text(fallback)}</span>;
  const name = (key: string) => { const value = label(kind, key); return value === key ? text('permission-display.unresolvedLabel') : value; };
  return <div data-permission-result={field} className='flex max-w-80 flex-wrap gap-1'>
    {field === 'button' ? <span className='text-xs'>{keys.slice(0, 3).map(name).join(', ')}</span>
      : keys.slice(0, field === 'resource' ? keys.length : 3).map((key) =>
        <Badge key={key} variant='outline' className={`whitespace-normal break-words ${field === 'menu' ? 'text-blue-600' : key === 'delete' ? 'text-red-600' : ''}`}>{name(key)}</Badge>)}
    {field !== 'resource' && keys.length > 3 && (onDetail
      ? <Button type='button' variant='link' className='h-auto p-0 text-xs' onClick={onDetail}>{text('permission-display.viewAll', { count: keys.length })}</Button>
      : <span className='text-xs text-muted-foreground'>{text('permission-display.total', { count: keys.length })}</span>)}
  </div>;
}

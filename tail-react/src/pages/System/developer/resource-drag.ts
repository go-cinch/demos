import type { ResourceChildOrder } from '@/api/system';
import { childOrderKey, resourceChildren } from '../components/resource-order';
import type { Catalog } from './catalog-model';
import { canMoveResource, type ResourceDestination } from './resource-movement';

export type ResourceTreeRow = ResourceChildOrder & { parent: string };
export type ResourceDrop = { row: ResourceTreeRow; mode: 'before' | 'after' | 'inside'; destination: ResourceDestination };
export const resourceRowId = (row: ResourceTreeRow) => JSON.stringify([row.parent, row.kind, row.key]);

/** Resolve against one header, never the enclosing subtree's rectangle. */
export function resourceDropTarget(catalog: Catalog, scope: string, source: ResourceTreeRow, target: ResourceTreeRow, ratio: number, insideOnly = false): ResourceDrop | null {
  const rc = catalog.resource_catalog;
  const node = rc.resources[source.key];
  const targetNode = rc.resources[target.key];
  if (!node || !targetNode || !source.key.startsWith(`${scope}:`) || !target.key.startsWith(`${scope}:`) || resourceRowId(source) === resourceRowId(target)) return null;
  if (source.kind === 'reference' ? !rc.resources[source.parent]?.references?.includes(source.key) : (node.parent ?? '') !== source.parent) return null;
  const targetExists = resourceChildren(rc, target.parent, scope).some(item => childOrderKey(item) === childOrderKey(target));
  if (!targetExists) return null;
  const middle = ratio > 0.25 && ratio < 0.75;
  const inside = target.kind === 'node' && targetNode.kind === 'directory' && (middle || insideOnly) && (source.kind === 'node' || target.key === source.parent);
  if (insideOnly && !inside) return null;
  let position = inside ? 0 : ratio < 0.5 ? -1 : 1;
  if (!inside && source.parent === target.parent) {
    const order = resourceChildren(rc, source.parent, scope);
    const from = order.findIndex(item => childOrderKey(item) === childOrderKey(source));
    const to = order.findIndex(item => childOrderKey(item) === childOrderKey(target));
    if (from < 0 || to < 0) return null;
    if (middle || (position < 0 && from === to - 1) || (position > 0 && from === to + 1)) position = from > to ? -1 : 1;
  }
  const parent = position === 0 ? target.key : target.parent;
  if (source.kind === 'reference' ? parent !== source.parent : !canMoveResource(catalog, source.key, parent)) return null;
  const anchor = { kind: target.kind, key: target.key };
  return { row: target, mode: position === 0 ? 'inside' : position < 0 ? 'before' : 'after', destination: { parent, ...(position < 0 ? { before: anchor } : position > 0 ? { after: anchor } : {}) } };
}

export function referenceStep(catalog: Catalog, owner: string, key: string, direction: -1 | 1): ResourceDestination | null {
  const order = resourceChildren(catalog.resource_catalog, owner, owner.split(':')[0]);
  const index = order.findIndex(item => item.kind === 'reference' && item.key === key);
  const anchor = index < 0 ? undefined : order[index + direction];
  return anchor ? { parent: owner, ...(direction < 0 ? { before: anchor } : { after: anchor }) } : null;
}
export function referencePosition(catalog: Catalog, owner: string, key: string, position: number): ResourceDestination | null {
  const order = resourceChildren(catalog.resource_catalog, owner, owner.split(':')[0]);
  if (!Number.isInteger(position) || position < 1 || position > order.length || !order.some(item => item.kind === 'reference' && item.key === key)) return null;
  const remaining = order.filter(item => !(item.kind === 'reference' && item.key === key));
  const anchor = remaining[position - 1];
  return { parent: owner, ...(anchor ? { before: anchor } : {}) };
}

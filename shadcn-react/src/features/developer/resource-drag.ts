import type { ResourceChildOrder } from '../permissions/types';
import { childOrderKey, resourceChildren } from '../permissions/resource-order';
import type { Catalog } from './catalog-model';
import { canMoveResource, type ResourceDestination } from './resource-movement';

export type ResourceTreeRow = ResourceChildOrder & { parent: string };
export type ResourceDrop = {
  row: ResourceTreeRow;
  mode: 'before' | 'after' | 'inside';
  destination: ResourceDestination;
};
export const resourceRowId = (row: ResourceTreeRow) => JSON.stringify([row.parent, row.kind, row.key]);

/** Resolve one row header, independently of the height of its expanded subtree. */
export function resourceDropTarget(
  catalog: Catalog,
  scope: string,
  source: ResourceTreeRow,
  target: ResourceTreeRow,
  ratio: number
): ResourceDrop | null {
  const rc = catalog.resource_catalog;
  const node = rc.resources[source.key];
  const targetNode = rc.resources[target.key];
  if (!node || !targetNode || !Number.isFinite(ratio) ||
    !source.key.startsWith(`${scope}:`) || !target.key.startsWith(`${scope}:`) ||
    resourceRowId(source) === resourceRowId(target)) return null;
  if (source.kind === 'reference'
    ? !rc.resources[source.parent]?.references?.includes(source.key)
    : (node.parent ?? '') !== source.parent) return null;
  if (!resourceChildren(rc, target.parent, scope).some((item) => childOrderKey(item) === childOrderKey(target))) return null;
  const middle = ratio > 0.25 && ratio < 0.75;
  const inside = target.kind === 'node' && targetNode.kind === 'directory' && middle &&
    (source.kind === 'node' || target.key === source.parent);
  let position = inside ? 0 : ratio < 0.5 ? -1 : 1;
  if (!inside && source.parent === target.parent) {
    const order = resourceChildren(rc, source.parent, scope);
    const from = order.findIndex((item) => childOrderKey(item) === childOrderKey(source));
    const to = order.findIndex((item) => childOrderKey(item) === childOrderKey(target));
    if (from < 0 || to < 0) return null;
    // Like Vben, a middle or adjacent reverse-edge drop exchanges siblings.
    if (middle || (position < 0 && from === to - 1) || (position > 0 && from === to + 1))
      position = from > to ? -1 : 1;
  }
  const parent = inside ? target.key : target.parent;
  if (source.kind === 'reference' ? parent !== source.parent : !canMoveResource(catalog, source.key, parent)) return null;
  const anchor = { kind: target.kind, key: target.key };
  return {
    row: target,
    mode: inside ? 'inside' : position < 0 ? 'before' : 'after',
    destination: { parent, ...(position < 0 ? { before: anchor } : position > 0 ? { after: anchor } : {}) }
  };
}

/** References advance through the same mixed child order as owned nodes. */
export function referenceStep(catalog: Catalog, owner: string, key: string, direction: -1 | 1): ResourceDestination | null {
  const order = resourceChildren(catalog.resource_catalog, owner, owner.split(':')[0]!);
  const index = order.findIndex((item) => item.kind === 'reference' && item.key === key);
  const anchor = index < 0 ? undefined : order[index + direction];
  return anchor ? { parent: owner, ...(direction < 0 ? { before: anchor } : { after: anchor }) } : null;
}

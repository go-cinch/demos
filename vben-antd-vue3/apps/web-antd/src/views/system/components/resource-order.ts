import type { ResourceCatalog, ResourceChildOrder } from '#/api/system';

export const childOrderKey = (item: ResourceChildOrder) =>
  `${item.kind}:${item.key}`;

// Reference positions belong to their owner, never to the target's sort value.
export function resourceChildren(
  catalog: ResourceCatalog,
  parent: string,
  scope: string,
): ResourceChildOrder[] {
  const nodes: ResourceChildOrder[] = Object.entries(catalog.resources)
    .filter(
      ([key, node]) =>
        key.startsWith(`${scope}:`) && (node.parent ?? '') === parent,
    )
    .sort(([a, x], [b, y]) => x.sort - y.sort || a.localeCompare(b))
    .map(([key]) => ({ kind: 'node', key }));
  const references: ResourceChildOrder[] = (
    catalog.resources[parent]?.references ?? []
  )
    .filter((key) => !!catalog.resources[key])
    .map((key) => ({ kind: 'reference', key }));
  const available = new Map(
    [...nodes, ...references].map((item) => [childOrderKey(item), item]),
  );
  const result: ResourceChildOrder[] = [];
  for (const item of catalog.resources[parent]?.child_order ?? []) {
    const id = childOrderKey(item);
    if (available.has(id)) {
      result.push(available.get(id)!);
      available.delete(id);
    }
  }
  return [...result, ...available.values()];
}

export function storeResourceOrder(
  catalog: ResourceCatalog,
  parent: string,
  order: ResourceChildOrder[],
  renumber = true,
) {
  const owner = catalog.resources[parent];
  if (owner) {
    owner.child_order = order;
    if (owner.references)
      owner.references = order
        .filter((item) => item.kind === 'reference')
        .map((item) => item.key);
  }
  if (owner?.reference_operations)
    owner.reference_operations = Object.fromEntries(Object.entries(owner.reference_operations).filter(([target]) => owner.references?.includes(target)));
  if (renumber)
    order
      .filter((item) => item.kind === 'node')
      .forEach((item, index) => {
        if (catalog.resources[item.key])
          catalog.resources[item.key]!.sort = (index + 1) * 10;
      });
}

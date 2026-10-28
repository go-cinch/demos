import type { ResourceChildOrder } from '@/api/system';
import {
  childOrderKey,
  resourceChildren,
  storeResourceOrder,
} from '../components/resource-order';
import type { Catalog } from './catalog-model';
import { clone } from './catalog-model';
import {
  referenceGraphIssues,
  resourceReachable,
} from '../components/resource-references';

export interface ResourceDestination {
  parent: string;
  before?: ResourceChildOrder;
  after?: ResourceChildOrder;
}
export interface ResourceKeyChange {
  before: string;
  after: string;
  numbered: boolean;
}

export function siblingKeys(catalog: Catalog, key: string) {
  const resources = catalog.resource_catalog.resources;
  const node = resources[key];
  if (!node) return [];
  return Object.keys(resources)
    .filter(
      (id) =>
        id.split(':')[0] === key.split(':')[0] &&
        (resources[id]!.parent ?? '') === (node.parent ?? ''),
    )
    .sort(
      (a, b) => resources[a]!.sort - resources[b]!.sort || a.localeCompare(b),
    );
}

export function canMoveResource(catalog: Catalog, key: string, parent: string) {
  const resources = catalog.resource_catalog.resources;
  const node = resources[key];
  if (
    !node ||
    (parent && resources[parent]?.kind !== 'directory') ||
    (parent && parent.split(':')[0] !== key.split(':')[0]) ||
    (!parent && node.kind === 'resource') ||
    (parent && resourceReachable(catalog.resource_catalog, key, parent))
  )
    return false;
  return true;
}

export function moveResource(
  catalog: Catalog,
  key: string,
  destination: ResourceDestination,
  pendingRenames: Record<string, string> = {},
) {
  if (!canMoveResource(catalog, key, destination.parent))
    throw new Error('invalidMove');
  const next = clone(catalog);
  const rc = next.resource_catalog;
  const original = catalog.resource_catalog.resources;
  const scope = key.split(':')[0]!;
  const oldParent = original[key]!.parent ?? '';
  // Freeze each owner's displayed order before keys or ownership change.
  for (const [owner, node] of Object.entries(rc.resources)) {
    if (owner.startsWith(`${scope}:`) && node.kind === 'directory')
      node.child_order = resourceChildren(rc, owner, scope);
  }
  const changedParent = (original[key]!.parent ?? '') !== destination.parent;
  const changes: ResourceKeyChange[] = [];
  const resourceKeys: Record<string, string> = {};
  const featureKeys: Record<string, string> = {};
  if (changedParent) {
    const subtree: string[] = [];
    const collect = (id: string) => {
      subtree.push(id);
      for (const [child, node] of Object.entries(original))
        if (node.parent === id) collect(child);
    };
    collect(key);
    const occupied = new Set(Object.keys(original));
    for (const from of subtree) {
      const parent =
        from === key
          ? destination.parent
          : resourceKeys[original[from]!.parent!]!;
      const prefix = parent || from.split(':')[0]!;
      const leaf = from.split(':').at(-1)!;
      let to = `${prefix}:${leaf}`;
      let sequence = 1;
      while (
        (occupied.has(to) && to !== from) ||
        (pendingRenames[to] && pendingRenames[to] !== from)
      )
        to = `${prefix}:${leaf}-${++sequence}`;
      if (to.length + 7 > 128) throw new Error('identifierTooLong');
      occupied.add(to);
      resourceKeys[from] = to;
      if (from !== to)
        changes.push({ before: from, after: to, numbered: sequence > 1 });
      for (const operation of Object.values(original[from]!.operations ?? {}))
        for (const feature of operation.button_keys)
          featureKeys[feature] = `${to}:${feature.slice(from.length + 1)}`;
    }
    rc.resources = Object.fromEntries(
      Object.entries(rc.resources).map(([id, node]) => {
        if (id === key) {
          if (destination.parent) node.parent = destination.parent;
          else delete node.parent;
        } else if (node.parent)
          node.parent = resourceKeys[node.parent] ?? node.parent;
        if (node.parent) {
          delete node.frontend_visible;
          delete node.permission_group;
        }
        if (node.child_order)
          node.child_order = node.child_order.map((item) => ({
            ...item,
            key: resourceKeys[item.key] ?? item.key,
          }));
        if (node.references)
          node.references = [
            ...new Set(
              node.references.map((target) => resourceKeys[target] ?? target),
            ),
          ];
        if (node.reference_operations)
          node.reference_operations = Object.fromEntries(Object.entries(node.reference_operations).map(([target, operations]) => [resourceKeys[target] ?? target, operations]));
        for (const operation of Object.values(node.operations ?? {}))
          operation.button_keys = operation.button_keys.map(
            (feature) => featureKeys[feature] ?? feature,
          );
        return [resourceKeys[id] ?? id, node];
      }),
    );
    // If a referenced node becomes owned by this directory, its real tree row
    // replaces the redundant link.
    for (const [owner, node] of Object.entries(rc.resources)) {
      if (owner.startsWith(`${scope}:`) && node.references)
        node.references = node.references.filter(
          (target) => !resourceReachable(rc, owner, target, false),
        );
    }
    for (const node of Object.values(rc.resources))
      if (node.reference_operations)
        node.reference_operations = Object.fromEntries(Object.entries(node.reference_operations).filter(([target]) => node.references?.includes(target)));
    rc.buttons = Object.fromEntries(
      Object.entries(rc.buttons).map(([id, feature]) => [
        featureKeys[id] ?? id,
        feature,
      ]),
    );
    for (const messages of Object.values(next.messages)) {
      const frontend = messages.frontend as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!frontend) continue;
      for (const [group, mapping] of Object.entries({
        resources: resourceKeys,
        features: featureKeys,
      })) {
        if (frontend[group])
          frontend[group] = Object.fromEntries(
            Object.entries(frontend[group]).map(([id, value]) => [
              mapping[id] ?? id,
              value,
            ]),
          );
      }
    }
  }
  for (const [owner, node] of Object.entries(rc.resources)) {
    if (owner.startsWith(`${scope}:`) && node.child_order)
      node.child_order = resourceChildren(rc, owner, scope);
  }
  const selectedKey = resourceKeys[key] ?? key;
  const order = resourceChildren(rc, destination.parent, scope).filter(
    (item) => !(item.kind === 'node' && item.key === selectedKey),
  );
  const anchor = destination.before ?? destination.after;
  const mappedAnchor = anchor
    ? { ...anchor, key: resourceKeys[anchor.key] ?? anchor.key }
    : undefined;
  let index = mappedAnchor
    ? order.findIndex(
        (item) => childOrderKey(item) === childOrderKey(mappedAnchor),
      )
    : order.length;
  if (index < 0 && anchor) {
    // Dropping a real node beside its own link replaces that link at its local
    // position; owning the node makes the reference redundant.
    const previous = resourceChildren(
      catalog.resource_catalog,
      destination.parent,
      scope,
    );
    const oldIndex = previous.findIndex(
      (item) => childOrderKey(item) === childOrderKey(anchor),
    );
    if (oldIndex < 0) throw new Error('invalidMove');
    const remaining = new Set(order.map(childOrderKey));
    index = previous
      .slice(0, oldIndex)
      .filter((item) =>
        remaining.has(
          childOrderKey({ ...item, key: resourceKeys[item.key] ?? item.key }),
        ),
      ).length;
  } else if (destination.after) index++;
  order.splice(index, 0, { kind: 'node', key: selectedKey });
  const previousOrder = resourceChildren(
    catalog.resource_catalog,
    oldParent,
    scope,
  )
    .map(childOrderKey)
    .join('|');
  const moved =
    changedParent || previousOrder !== order.map(childOrderKey).join('|');
  if (!moved)
    return {
      document: catalog,
      key,
      changes: [],
      resourceKeys: {},
      featureKeys: {},
      moved: false,
    };
  if (oldParent !== destination.parent)
    storeResourceOrder(rc, oldParent, resourceChildren(rc, oldParent, scope));
  storeResourceOrder(rc, destination.parent, order);
  if (referenceGraphIssues(rc).length) throw new Error('invalidMove');
  return {
    document: next,
    key: selectedKey,
    changes,
    resourceKeys,
    featureKeys,
    moved: true,
  };
}

export function moveReference(
  catalog: Catalog,
  owner: string,
  key: string,
  destination: ResourceDestination,
) {
  if (
    destination.parent !== owner ||
    !catalog.resource_catalog.resources[owner]?.references?.includes(key)
  )
    throw new Error('invalidMove');
  const next = clone(catalog);
  const scope = owner.split(':')[0]!;
  const order = resourceChildren(next.resource_catalog, owner, scope).filter(
    (item) => !(item.kind === 'reference' && item.key === key),
  );
  const anchor = destination.before ?? destination.after;
  const index = anchor
    ? order.findIndex((item) => childOrderKey(item) === childOrderKey(anchor))
    : order.length;
  if (index < 0) throw new Error('invalidMove');
  order.splice(index + (destination.after ? 1 : 0), 0, {
    kind: 'reference',
    key,
  });
  storeResourceOrder(next.resource_catalog, owner, order, false);
  return next;
}

// Within a directory the arrows advance one displayed position. At a boundary,
// resources enter the adjacent directory; subdirectories may move up a level.
export function resourceStep(
  catalog: Catalog,
  key: string,
  direction: -1 | 1,
): ResourceDestination | null {
  const rc = catalog.resource_catalog;
  const node = rc.resources[key];
  if (!node) return null;
  const scope = key.split(':')[0]!;
  const parent = node.parent ?? '';
  const order = resourceChildren(rc, parent, scope);
  const index = order.findIndex(
    (item) => item.kind === 'node' && item.key === key,
  );
  if (index < 0) return null;
  const neighbor = order[index + direction];
  if (neighbor)
    return {
      parent,
      ...(direction < 0 ? { before: neighbor } : { after: neighbor }),
    };
  if (node.kind === 'directory' && parent) {
    const grandparent = rc.resources[parent]?.parent ?? '';
    if (canMoveResource(catalog, key, grandparent))
      return {
        parent: grandparent,
        ...(direction < 0
          ? { before: { kind: 'node', key: parent } as const }
          : { after: { kind: 'node', key: parent } as const }),
      };
  }
  const directories: string[] = [];
  const seen = new Set<string>();
  const visit = (owner: string) => {
    for (const item of resourceChildren(rc, owner, scope)) {
      if (
        item.kind !== 'node' ||
        rc.resources[item.key]?.kind !== 'directory' ||
        seen.has(item.key)
      )
        continue;
      seen.add(item.key);
      directories.push(item.key);
      visit(item.key);
    }
  };
  visit('');
  const start = directories.indexOf(parent || key);
  for (
    let i = start + direction;
    i >= 0 && i < directories.length;
    i += direction
  ) {
    const target = directories[i]!;
    if (!canMoveResource(catalog, key, target)) continue;
    const children = resourceChildren(rc, target, scope);
    const first = children[0];
    return {
      parent: target,
      ...(direction > 0 && first ? { before: first } : {}),
    };
  }
  return null;
}

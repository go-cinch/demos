import type { ResourceCatalog, ResourceNode } from '#/api/system';
import { permissionOperations, resourceBreadcrumb, resourceTree } from './resource-catalog';
import { childOrderKey, resourceChildren } from './resource-order';

// Resolve directory references through explicit operation intersections. Reference
// selections describe the linked path; canonical resources retain their own operations.
export function referenceResourceBindings(
  catalog: ResourceCatalog,
  key: string,
  allowed: readonly string[] = [...permissionOperations, '*'],
  path = new Set<string>(),
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const node = catalog.resources[key];
  if (!node || path.has(key)) return result;
  if (node.kind === 'resource') {
    const operations = allowed.filter((operation) => operation === '*' ? node.permission_scope === '*' : !!node.operations?.[operation]);
    if (operations.length) result.set(key, [...operations]);
    return result;
  }
  const seen = new Set([...path, key]);
  for (const child of resourceChildren(catalog, key, key.split(':')[0]!)) {
    const operations = child.kind === 'reference'
      ? allowed.filter((operation) => referencedOperations(catalog, key, child.key, seen).includes(operation))
      : allowed;
    for (const [resource, selected] of referenceResourceBindings(catalog, child.key, operations, seen))
      result.set(resource, [...new Set([...(result.get(resource) ?? []), ...selected])]);
  }
  return result;
}

export function availableReferenceOperations(catalog: ResourceCatalog, target: string) {
  const available = new Set([...referenceResourceBindings(catalog, target).values()].flat());
  return permissionOperations.filter((operation) => available.has(operation)).map(String);
}

export function referencedOperations(
  catalog: ResourceCatalog,
  owner: string,
  target: string,
  path = new Set<string>(),
): string[] {
  const node = catalog.resources[owner];
  const explicit = node?.reference_operations?.[target];
  if (explicit !== undefined) return explicit;
  return [...new Set([...referenceResourceBindings(catalog, target, permissionOperations, path).values()].flat())];
}

export function supportsResourceReferences(
  node: Pick<ResourceNode, 'kind' | 'parent' | 'references'> | undefined,
) {
  return node?.kind === 'directory';
}

export function resourceReachable(
  catalog: ResourceCatalog,
  from: string,
  target: string,
  includeReferences = true,
) {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const key = queue.pop()!;
    if (key === target) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(
      ...Object.entries(catalog.resources)
        .filter(([, node]) => node.parent === key)
        .map(([child]) => child),
    );
    if (includeReferences)
      queue.push(...(catalog.resources[key]?.references ?? []));
  }
  return false;
}

export function canReferenceResource(
  catalog: ResourceCatalog,
  owner: string,
  target: string,
) {
  return (
    !!catalog.resources[target] &&
    owner.split(':')[0] === target.split(':')[0] &&
    !resourceReachable(catalog, owner, target, false) &&
    !resourceReachable(catalog, target, owner)
  );
}

export function referenceGraphIssues(catalog: ResourceCatalog) {
  const issues: {
    key: string;
    field: 'references';
    code: string;
  }[] = [];
  const edges = new Map<string, string[]>();
  for (const [key, node] of Object.entries(catalog.resources)) {
    const scope = key.split(':')[0]!;
    if (node.parent)
      edges.set(node.parent, [...(edges.get(node.parent) ?? []), key]);
    const references = node.references ?? [];
    if (
      (references.length && node.kind !== 'directory') ||
      new Set(references).size !== references.length ||
      references.some(
        (target) =>
          target === key ||
          !catalog.resources[target] ||
          target.split(':')[0] !== scope,
      )
    )
      issues.push({ key, field: 'references', code: 'invalidReference' });
    for (const [target, operations] of Object.entries(node.reference_operations ?? {})) {
      if (!references.includes(target) || !operations.length ||
          new Set(operations).size !== operations.length ||
          operations.some((operation) => !availableReferenceOperations(catalog, target).includes(operation)))
        issues.push({ key, field: 'references', code: 'invalidReferenceOperations' });
    }
    edges.set(key, [...(edges.get(key) ?? []), ...references]);
  }
  const states = new Map<string, number>();
  const visit = (key: string): boolean => {
    if (states.get(key) === 1) return false;
    if (states.get(key) === 2) return true;
    states.set(key, 1);
    if ((edges.get(key) ?? []).some((target) => !visit(target))) return false;
    states.set(key, 2);
    return true;
  };
  for (const key of Object.keys(catalog.resources)) {
    if (!visit(key)) {
      issues.push({ key, field: 'references', code: 'invalidReference' });
      break;
    }
  }
  return issues;
}

export const referenceTreeKey = (owner: string, target: string) =>
  `reference:${owner}->${target}`;

export interface ReferenceTreeNode {
  key: string;
  title: string;
  selectable: boolean;
  children: ReferenceTreeNode[];
  referenceTarget?: string;
  referenceOwner?: string;
  isLeaf?: boolean;
}

export function resourceReferenceTree(
  catalog: ResourceCatalog,
  scope: string,
  query: string,
  label: (key: string) => string,
): ReferenceTreeNode[] {
  const search = query.trim().toLocaleLowerCase();
  const walk = (
    nodes: ReturnType<typeof resourceTree>,
    ancestorMatches = false,
  ): ReferenceTreeNode[] =>
    nodes.flatMap((node) => {
      const matches =
        ancestorMatches ||
        !search ||
        `${node.key} ${node.title}`.toLocaleLowerCase().includes(search);
      const children = walk(node.children, matches);
      const references: ReferenceTreeNode[] = (
        catalog.resources[node.key]?.references ?? []
      )
        .filter(
          (target) =>
            catalog.resources[target] &&
            (matches ||
              `${target} ${resourceBreadcrumb(catalog, target, label)}`
                .toLocaleLowerCase()
                .includes(search)),
        )
        .map((target) => ({
          key: referenceTreeKey(node.key, target),
          title: label(target),
          selectable: true,
          children: [],
          isLeaf: true,
          referenceTarget: target,
          referenceOwner: node.key,
        }));
      if (!matches && !children.length && !references.length) return [];
      const positions = new Map(
        resourceChildren(catalog, node.key, scope).map((item, index) => [
          childOrderKey(item),
          index,
        ]),
      );
      const allChildren = [...children, ...references].sort(
        (a, b) =>
          (positions.get(
            childOrderKey({
              kind: a.referenceTarget ? 'reference' : 'node',
              key: a.referenceTarget ?? a.key,
            }),
          ) ?? 0) -
          (positions.get(
            childOrderKey({
              kind: b.referenceTarget ? 'reference' : 'node',
              key: b.referenceTarget ?? b.key,
            }),
          ) ?? 0),
      );
      return [{ ...node, selectable: true, children: allChildren }];
    });
  return walk(resourceTree(catalog, scope, '', label));
}

/** Match the full menu's depth-first order, including mixed reference positions.
 * A referenced resource has one card at its first occurrence. Search and grant
 * selection never change this order; retain unresolved keys at the end.
 */
export function orderPermissionResourceKeys(
  catalog: ResourceCatalog,
  scope: string,
  keys: readonly string[],
): string[] {
  const remaining = new Set(keys);
  if (!remaining.size) return [];
  const result: string[] = [];
  const visit = (nodes: ReferenceTreeNode[]) => {
    for (const node of nodes) {
      const key = node.referenceTarget ?? node.key;
      if (remaining.delete(key)) result.push(key);
      visit(node.children);
    }
  };
  visit(resourceReferenceTree(catalog, scope, '', (key) => key));
  return [...result, ...remaining];
}

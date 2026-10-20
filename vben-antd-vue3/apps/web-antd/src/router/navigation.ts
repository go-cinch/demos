import type { RouteRecordRaw } from '@vben/types';
import type { PermissionMenu, PermissionNavigation } from '#/api/core/user';

/** Page components are local; hierarchy, visibility and order come from the catalog. */
export function resourceNavigationRoutes(
  routes: RouteRecordRaw[],
  menus: PermissionMenu[],
  navigation: PermissionNavigation[],
): RouteRecordRaw[] {
  const pages = new Map<string, RouteRecordRaw>();
  const directories = new Map<string, RouteRecordRaw>();
  const index = (items: RouteRecordRaw[], parent = '') => {
    for (const route of items) {
      const path = route.path.startsWith('/')
        ? route.path
        : `${parent}/${route.path}`;
      if (route.children?.length) {
        const key = String(route.meta?.title ?? '').replace(
          /^menus\.([^:]+):menu:/,
          '$1:',
        );
        directories.set(key, { ...route, path });
        index(route.children, path);
      } else pages.set(path, { ...route, path });
    }
  };
  index(routes);
  const allowed = new Map(menus.map((menu) => [menu.menu_key, menu.menu_path]));
  const used = new Set<string>();
  const build = (nodes: PermissionNavigation[]): RouteRecordRaw[] =>
    nodes.flatMap((node, order) => {
      if (node.menu_path && node.menu_key) {
        const page = pages.get(node.menu_path);
        if (
          !page ||
          allowed.get(node.menu_key) !== node.menu_path ||
          used.has(node.menu_path)
        )
          return [];
        used.add(node.menu_path);
        return [
          {
            ...page,
            meta: {
              ...page.meta,
              authority: [node.menu_path],
              hideInMenu: false,
              order,
              title: `resources.${node.resource_key}`,
            },
          },
        ];
      }
      const children = build(node.children ?? []);
      if (!children.length) return [];
      const directory = directories.get(node.resource_key);
      return [
        {
          name: `ResourceDirectory_${node.resource_key}`,
          path:
            directory?.path ??
            `/_resource/${node.resource_key.replaceAll(':', '/')}`,
          meta: {
            icon: directory?.meta?.icon ?? 'lucide:folder',
            title: `resources.${node.resource_key}`,
            order,
            authority: [...allowed.values()],
          },
          redirect: children[0]!.path,
          children,
        } as RouteRecordRaw,
      ];
    });
  const result = build(navigation);
  // Hidden roots still permit direct access and account/message entry points.
  for (const menu of menus) {
    const page = pages.get(menu.menu_path);
    if (!page || used.has(menu.menu_path)) continue;
    used.add(menu.menu_path);
    result.push({
      ...page,
      meta: {
        ...page.meta,
        authority: [menu.menu_path],
        hideInMenu: true,
        title: `menus.${menu.menu_key}`,
      },
    });
  }
  return result;
}

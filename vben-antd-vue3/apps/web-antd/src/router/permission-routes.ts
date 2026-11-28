import type {
  RouteLocationNormalized,
  Router,
  RouteRecordRaw,
} from 'vue-router';

import { coreRouteNames } from '#/router/routes';

type RouteName = NonNullable<RouteRecordRaw['name']>;
type Entry = { parent?: RouteName; route: RouteRecordRaw };
const installed = new WeakMap<Router, Map<RouteName, Entry>>();
const routeUpdates = new WeakMap<Router, () => void>();

export function matchChanged(
  route: RouteLocationNormalized,
  next: ReturnType<Router['resolve']>,
) {
  return (
    route.name !== next.name ||
    route.matched.length !== next.matched.length ||
    next.matched.some((record, index) => record !== route.matched[index])
  );
}

// A background permission refresh can move or remove the open page. Let an
// in-flight navigation finish first so it cannot be replaced by its origin.
export function trackPermissionRouteChanges(router: Router) {
  let pending: RouteLocationNormalized | undefined;
  let changed = false;
  function reconcile() {
    if (pending || !changed) return;
    changed = false;
    const current = router.currentRoute.value;
    if (
      current.matched.length &&
      matchChanged(current, router.resolve(current.fullPath))
    ) {
      const { path, query, hash } = current;
      // Navigation errors are reported through router.onError.
      void router.replace({ path, query, hash, force: true }).catch(() => {});
    }
  }
  router.beforeEach((to) => {
    pending = to;
  });
  function finished(to: RouteLocationNormalized) {
    if (pending === to) pending = undefined;
    reconcile();
  }
  router.afterEach(finished);
  router.onError((_, to) => finished(to));
  routeUpdates.set(router, () => {
    changed = true;
    reconcile();
  });
}

// Vue Router's matched records also own component instances. Removing the root
// or an unchanged page during navigation leaves the pending target with stale records.
export function installPermissionRoutes(
  router: Router,
  routes: RouteRecordRaw[],
) {
  const root = router.getRoutes().find((record) => record.path === '/');
  const previous = installed.get(router) ?? new Map<RouteName, Entry>();
  const next = new Map<RouteName, Entry>();
  function collect(route: RouteRecordRaw, parent?: RouteName) {
    if (!route.name)
      throw new Error(`Missing permission route name: ${route.path}`);
    next.set(route.name, { parent, route });
    for (const child of route.children ?? []) collect(child, route.name);
  }
  for (const route of routes)
    collect(
      route,
      route.meta?.noBasicLayout ? undefined : (root?.name ?? undefined),
    );

  for (const [name, old] of previous) {
    const wanted = next.get(name);
    if (
      (!wanted ||
        old.parent !== wanted.parent ||
        old.route.path !== wanted.route.path ||
        old.route.component !== wanted.route.component) &&
      router.hasRoute(name)
    ) {
      router.removeRoute(name);
    }
  }
  // Parents precede children. Removing a directory may also have removed a
  // surviving descendant, so consult the matcher before each registration.
  for (const [name, { parent, route }] of next) {
    if (previous.has(name) && router.hasRoute(name)) continue;
    const single = { ...route, children: [] };
    if (parent) router.addRoute(parent, single);
    else router.addRoute(single);
  }
  const records = new Map(
    router.getRoutes().map((record) => [record.name, record]),
  );
  for (const [name, { route }] of next) {
    const record = records.get(name)!;
    const meta = route.meta ?? {};
    for (const key of Object.keys(record.meta)) {
      if (!(key in meta)) delete record.meta[key];
    }
    Object.assign(record.meta, meta);
    record.redirect = route.redirect;
    record.children = route.children ?? [];
  }
  if (root) {
    root.children = [
      ...root.children.filter((child) =>
        coreRouteNames.includes(child.name as string),
      ),
      ...routes.filter((route) => !route.meta?.noBasicLayout),
    ];
  }
  installed.set(router, next);
  routeUpdates.get(router)?.();
}

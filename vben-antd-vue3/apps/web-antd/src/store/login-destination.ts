import type { PermissionMenu, PermissionNavigation } from '#/api/core/user';

import { userCache } from '@vben/utils/cache';

export interface LoginNavigation {
  menus: PermissionMenu[];
  navigation?: PermissionNavigation[];
}

export function canVisitAuthenticatedPage(
  permission: LoginNavigation,
  path: string,
): boolean {
  return (
    /^\/profile\/?$/i.test(path) ||
    permission.menus.some((menu) => menu.menu_path === path)
  );
}

export function firstAuthorizedMenu(permission: LoginNavigation): string {
  const allowed = new Set(permission.menus.map((menu) => menu.menu_path));
  function first(nodes: PermissionNavigation[]): string | undefined {
    for (const node of nodes) {
      if (node.menu_path && allowed.has(node.menu_path)) return node.menu_path;
      const child = first(node.children ?? []);
      if (child) return child;
    }
  }
  return (
    first(permission.navigation ?? []) ??
    permission.menus[0]?.menu_path ??
    '/profile'
  );
}

/** Unwrap legacy auth redirects without decoding a business page's query/hash. */
export function normalizeLoginRedirect(redirect: unknown): string | undefined {
  if (typeof redirect !== 'string') return;
  let value = redirect;
  try {
    // Bound both legacy URI decoding and nested auth pages for untrusted URLs.
    for (let depth = 0; depth < 64; depth += 1) {
      if (!value.startsWith('/')) {
        const decoded = decodeURIComponent(value);
        if (decoded === value) return;
        value = decoded;
        continue;
      }
      if (
        value.startsWith('//') ||
        /\\/.test(value) ||
        [...value].some((char) => char < ' ')
      )
        return;
      const url = new URL(value, 'https://login.invalid');
      if (url.origin !== 'https://login.invalid') return;
      if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) {
        const nested = url.searchParams.getAll('redirect');
        const target = nested[0];
        if (nested.length !== 1 || target === undefined) return;
        value = target;
        continue;
      }
      return url.pathname + url.search + url.hash;
    }
  } catch {
    /* Invalid escapes/URLs have no return destination. */
  }
}

/** Vue Router performs the query encoding; never pre-encode the destination. */
export function loginRedirectQuery(redirect: unknown): { redirect?: string } {
  const destination = normalizeLoginRedirect(redirect);
  return destination ? { redirect: destination } : {};
}

/** Redirects preserve query/hash only for authorized local pages. */
export function loginDestination(
  permission: LoginNavigation,
  redirect?: unknown,
): string {
  const value = normalizeLoginRedirect(redirect);
  if (value) {
    const url = new URL(value, 'https://login.invalid');
    if (canVisitAuthenticatedPage(permission, url.pathname)) {
      return value;
    }
  }
  return firstAuthorizedMenu(permission);
}

/** A return URL may contain a private record ID or filter. Only its owner can resume it. */
export function rememberAccountReturn(path?: string) {
  const cache = userCache.current('session');
  const marker = userCache.device('session');
  const target = normalizeLoginRedirect(path);
  if (!target || !userCache.account) {
    marker.removeItem('return-owner');
    cache.removeItem('return-to');
    return false;
  }
  cache.setItem('return-to', target);
  marker.setItem('return-owner', userCache.account);
  return true;
}

export function consumeAccountReturn(fallback?: string) {
  const marker = userCache.device('session');
  const owner = marker.getItem('return-owner');
  if (!owner) return fallback;
  marker.removeItem('return-owner');
  if (owner !== userCache.account) return;
  const cache = userCache.current('session');
  const target = cache.getItem('return-to') ?? undefined;
  cache.removeItem('return-to');
  return target;
}

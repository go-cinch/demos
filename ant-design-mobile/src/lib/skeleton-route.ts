import type { ResourceKind } from './types';
export type SkeletonKind =
  | 'management'
  | 'overview'
  | 'applications'
  | 'workspace'
  | 'security'
  | 'profile'
  | 'inbox'
  | 'auth'
  | 'page';
export function skeletonContext(path: string, tab = 'home') {
  if (path === '/' || path === '/dashboard') path = '/dashboard/overview';
  if (path === '/auth') path = '/auth/login';
  if (path === '/system') {
    path = '/dashboard/overview';
    tab = 'manage';
  }
  const resources: ResourceKind[] = [
    'user',
    'role',
    'user-group',
    'action',
    'dictionary',
    'whitelist',
  ];
  const resource = resources.find((value) => path === `/system/${value}`);
  const kind: SkeletonKind =
    resource || path === '/system/msg'
      ? 'management'
      : path.startsWith('/auth/')
        ? 'auth'
        : path === '/profile'
          ? 'profile'
          : path === '/msg/inbox'
            ? 'inbox'
            : path === '/dashboard/workspace'
              ? 'workspace'
              : path.startsWith('/dashboard/')
                ? tab === 'manage'
                  ? 'applications'
                  : tab === 'home'
                    ? 'overview'
                    : tab === 'workspace'
                      ? 'workspace'
                      : 'security'
                : 'page';
  return {
    kind,
    resource,
    messages: path === '/system/msg',
    mode: path.split('/').at(-1) || 'login',
  };
}

import { describe, expect, it } from 'vitest';
import { skeletonContext } from './skeleton-route';
describe('destination skeleton layout', () => {
  it.each([
    ['/', 'home', 'overview'],
    ['/dashboard', 'home', 'overview'],
    ['/auth', 'home', 'auth'],
    ['/system', 'home', 'applications'],
    ['/dashboard/overview', 'manage', 'applications'],
    ['/dashboard/overview', 'security', 'security'],
    ['/dashboard/overview', 'home', 'overview'],
    ['/dashboard/workspace', 'home', 'workspace'],
    ['/profile', 'home', 'profile'],
    ['/msg/inbox', 'home', 'inbox'],
    ['/system/msg', 'home', 'management'],
    ['/auth/login', 'home', 'auth'],
    ['/auth/register', 'home', 'auth'],
    ['/auth/reset-password', 'home', 'auth'],
  ])('uses the destination %s with tab %s', (path, tab, kind) => {
    expect(skeletonContext(path, tab).kind).toBe(kind);
  });
  it.each(['user', 'role', 'user-group', 'action', 'dictionary', 'whitelist'])(
    'retains resource-specific row geometry for %s',
    (resource) => {
      expect(skeletonContext(`/system/${resource}`)).toMatchObject({
        kind: 'management',
        resource,
        messages: false,
      });
    },
  );
  it('keeps message management separate from generic resource lists', () => {
    expect(skeletonContext('/system/msg')).toMatchObject({ messages: true, resource: undefined });
  });
});

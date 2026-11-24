import { describe, expect, it } from 'vitest';

import {
  firstAuthorizedMenu,
  loginDestination,
  loginRedirectQuery,
  normalizeLoginRedirect,
} from './login-destination';

const permission = {
  menus: ['/dashboard/overview', '/system/user', '/msg/inbox'].map(
    (menu_path) => ({ menu_path, menu_key: menu_path, btns: [] }),
  ),
  navigation: [
    {
      resource_key: 'system',
      children: [{ resource_key: 'user', menu_path: '/system/user' }],
    },
    { resource_key: 'dashboard', menu_path: '/dashboard/overview' },
  ],
};
describe('login destination', () => {
  it('uses server menu order instead of a hardcoded dashboard', () => {
    expect(firstAuthorizedMenu(permission)).toBe('/system/user');
  });
  it('preserves authorized redirect query and fragment', () => {
    expect(
      loginDestination(
        permission,
        encodeURIComponent('/msg/inbox?q=hello#detail'),
      ),
    ).toBe('/msg/inbox?q=hello#detail');
  });
  it.each([
    '/system/role',
    '//evil.example',
    'https://evil.example',
    String.raw`/\evil.example`,
    '%E0%A4%A',
    '/auth/login',
    '/system/user/../../auth/login',
  ])('rejects unauthorized or unsafe redirect %s', (redirect) => {
    expect(loginDestination(permission, redirect)).toBe('/system/user');
  });
  it('falls back to personal profile with no menus', () => {
    expect(loginDestination({ menus: [] }, '/dashboard/overview')).toBe(
      '/profile',
    );
  });
});

const legacyWrap = (path: string, target: string) =>
  `${path}?redirect=${encodeURIComponent(encodeURIComponent(target))}`;

describe('redirect normalization', () => {
  it('unwraps repeated legacy auth handoffs and keeps encoded business query/hash intact', () => {
    const target = '/msg/inbox?q=a%26b%2Fc%25&tab=mine#detail';
    const legacy = legacyWrap(
      '/auth/login',
      legacyWrap('/auth/bind-totp', legacyWrap('/auth/reset-password', target)),
    );
    expect(normalizeLoginRedirect(legacy)).toBe(target);
    expect(loginDestination(permission, legacy)).toBe(target);
    expect(loginRedirectQuery(legacy)).toEqual({ redirect: target });
    expect(normalizeLoginRedirect(normalizeLoginRedirect(legacy))).toBe(target);
  });

  it('clears the reported authentication-only loop', () => {
    expect(
      loginRedirectQuery(
        '/auth/login?redirect=%252Fauth%252Fbind-totp%253Fredirect%253D%2525252Fauth%2525252Fbind-totp',
      ),
    ).toEqual({});
  });

  it.each([
    undefined,
    null,
    ['/profile', '/system/user'],
    '',
    '%E0%A4%A',
    '//evil.example',
    String.raw`/\evil.example`,
    '/auth/login?redirect=https%3A%2F%2Fevil.example',
    '/auth/login?redirect=/profile&redirect=/system/user',
    '/auth/bind-email',
  ])('drops invalid or ambiguous targets: %s', (target) => {
    expect(loginRedirectQuery(target)).toEqual({});
  });

  it('still checks the final destination against permissions', () => {
    expect(
      loginDestination(permission, legacyWrap('/auth/login', '/system/role')),
    ).toBe('/system/user');
  });

  it('bounds excessive encoding', () => {
    let target = '/profile';
    for (let i = 0; i < 70; i += 1) target = encodeURIComponent(target);
    expect(normalizeLoginRedirect(target)).toBeUndefined();
  });
});

it('returns to a private query only when the same account reauthenticates', async () => {
  const { userCache } = await import('@vben/utils/cache');
  const { rememberAccountReturn, consumeAccountReturn } =
    await import('./login-destination');
  const target = '/audit/login?username=alice';
  userCache.bind('A');
  rememberAccountReturn(target);
  userCache.bind('B');
  expect(consumeAccountReturn(target)).toBeUndefined();
  userCache.bind('A');
  rememberAccountReturn(target);
  userCache.bind(undefined);
  userCache.bind('A');
  expect(consumeAccountReturn()).toBe(target);
  expect(consumeAccountReturn()).toBeUndefined();
  userCache.bind(undefined);
});

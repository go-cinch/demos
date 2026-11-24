import { flushPromises, shallowMount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import Basic from './basic.vue';

const state = vi.hoisted(() => ({
  route: { value: { path: '/profile', fullPath: '/profile?tab=security' } },
  replace: vi.fn(),
  info: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: state.route, replace: state.replace }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ fetchUserInfo: state.info }),
}));
vi.mock('#/composables/use-permissions', () => ({
  usePermissions: () => ({ hasPage: () => false }),
}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/hooks', () => ({
  useWatermark: () => ({ destroyWatermark: vi.fn() }),
}));
vi.mock('@vben/preferences', () => ({
  preferences: { app: {} },
  usePreferences: () => ({ isDark: { value: false } }),
}));
vi.mock('@vben/stores', () => ({
  useTabbarStore: () => ({ tabs: [] }),
  useUserStore: () => ({ userInfo: { username: 'operator' } }),
  useAccessStore: () => ({ accessToken: 'session' }),
}));
vi.mock('@vben/layouts', () => ({
  BasicLayout: {},
  LockScreen: {},
  UserDropdown: {},
}));
vi.mock('@vben/common-ui', () => ({ AuthenticationLoginExpiredModal: {} }));
vi.mock('./msg-bell.vue', () => ({ default: {} }));
vi.mock('#/views/_core/authentication/login.vue', () => ({ default: {} }));

describe('rechecking access in the signed-in layout', () => {
  it.each(['focus', 'auth-permissions-changed'])(
    'keeps the profile and redirects a revoked management page on %s',
    async (event) => {
      state.info.mockReset().mockResolvedValue({ permission: { menus: [] } });
      state.replace.mockClear();
      state.route.value = {
        path: '/profile',
        fullPath: '/profile?tab=security',
      };
      const layout = shallowMount(Basic);
      try {
        window.dispatchEvent(new Event(event));
        await flushPromises();
        expect(state.info).toHaveBeenCalledWith({
          fresh: event === 'auth-permissions-changed',
        });
        expect(state.replace).not.toHaveBeenCalled();

        state.route.value = { path: '/system/user', fullPath: '/system/user' };
        window.dispatchEvent(new Event(event));
        await flushPromises();
        expect(state.replace).toHaveBeenCalledExactlyOnceWith('/forbidden');
      } finally {
        layout.unmount();
      }
    },
  );
});

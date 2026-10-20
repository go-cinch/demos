import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PermissionLink from './permission-link.vue';

const access = reactive({ paths: [] as string[], accessRoutes: [] as unknown[] });
vi.mock('#/composables/use-permissions', () => ({ usePermissions: () => ({ hasPage: (path: string) => access.paths.includes(path) }) }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
afterEach(() => { access.paths = []; access.accessRoutes = []; });

async function setup(path: string, registered = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/current', component: { template: '<div />' } },
    { path: '/:path(.*)*', name: 'FallbackNotFound', component: { template: '<div />' } },
    ...(registered ? [{ path, name: 'Target', component: { template: '<div />' } }] : []),
  ] });
  await router.push('/current'); await router.isReady();
  const errors: unknown[] = [];
  const wrapper = mount(PermissionLink, { props: { path, query: { word: 'admin' } }, slots: { default: '<span class="related-label">Related record</span>' }, global: { plugins: [router], config: { errorHandler: (error) => errors.push(error) } } });
  return { router, wrapper, errors };
}

describe('links to permission-filtered routes', () => {
  it.each(['/system/role', '/system/action', '/system/user'])('keeps %s relation text readable when its route is absent and unauthorized', async (path) => {
    const { wrapper, errors } = await setup(path);
    expect(wrapper.text()).toBe('Related record');
    expect(wrapper.find('a').exists()).toBe(false);
    expect(errors).toEqual([]);
    wrapper.unmount();
  });
  it('keeps links read-only while an authorized route has not been registered, then enables it when routes are published', async () => {
    access.paths = ['/system/role'];
    const { wrapper, router, errors } = await setup('/system/role');
    expect(wrapper.find('a').exists()).toBe(false);
    router.addRoute({ path: '/system/role', name: 'SystemRole', component: { template: '<div />' } });
    access.accessRoutes = [{ path: '/system/role' }];
    await flushPromises();
    expect(wrapper.get('a').attributes('href')).toBe('/system/role?word=admin');
    await wrapper.get('a').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/system/role');
    expect(errors).toEqual([]);
    access.paths = [];
    await flushPromises();
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toBe('Related record');
    wrapper.unmount();
  });
  it('does not expose an installed route without page permission', async () => {
    const { wrapper, errors } = await setup('/system/user', true);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(errors).toEqual([]);
    wrapper.unmount();
  });
});

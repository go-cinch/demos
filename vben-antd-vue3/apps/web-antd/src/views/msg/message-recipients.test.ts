import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import MessageRecipients from './message-recipients.vue';

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => access.allowed }) }));
vi.mock('#/locales', () => ({ $t: (key: string, params?: { username: string }) => params ? `View user ${params.username}` : key }));
afterEach(() => { access.allowed = true; });

async function render(recipients?: { id: number; username: string; code: string }[]) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/system/msg', component: { template: '<div />' } },
    { path: '/system/user', name: 'SystemUser', component: { template: '<div />' } },
  ] });
  await router.push('/system/msg'); await router.isReady();
  const wrapper = mount(MessageRecipients, { props: { recipients }, global: { plugins: [router] } });
  return { wrapper, router };
}
describe('message recipients', () => {
  it('displays usernames and navigates to a stable exact user-code filter', async () => {
    const { wrapper, router } = await render([{ id: 172, username: 'ren.zhi', code: 'H7LBL4EY' }]);
    const link = wrapper.get('a');
    expect(link.text()).toBe('ren.zhi');
    expect(link.attributes('href')).toBe('/system/user?code=H7LBL4EY');
    expect(wrapper.text()).not.toContain('172');
    await link.trigger('click'); await flushPromises();
    expect(router.currentRoute.value.name).toBe('SystemUser');
    expect(router.currentRoute.value.query).toEqual({ code: 'H7LBL4EY' });
    wrapper.unmount();
  });
  it('keeps usernames readable without offering inaccessible user links', async () => {
    access.allowed = false;
    const { wrapper } = await render([{ id: 172, username: 'ren.zhi', code: 'H7LBL4EY' }]);
    expect(wrapper.text()).toBe('ren.zhi'); expect(wrapper.find('a').exists()).toBe(false); wrapper.unmount();
  });
  it('does not show raw IDs or broken links for deleted recipients', async () => {
    const { wrapper } = await render([{ id: 173, username: '', code: '' }]);
    expect(wrapper.text()).toBe('msg.deletedRecipient'); expect(wrapper.find('a').exists()).toBe(false); wrapper.unmount();
  });
  it('distinguishes an empty recipient list from unavailable recipient details', async () => {
    const { wrapper } = await render(); expect(wrapper.text()).toBe('msg.recipientsUnavailable');
    await wrapper.setProps({ recipients: [] }); expect(wrapper.text()).toBe('msg.noRecipients'); wrapper.unmount();
  });
});

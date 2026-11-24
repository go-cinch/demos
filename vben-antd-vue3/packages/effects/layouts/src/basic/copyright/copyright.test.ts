import { createApp, h, nextTick, reactive } from 'vue';

import { expect, it } from 'vitest';

import Copyright from './copyright.vue';

it('renders link text safely while copyright URLs are invalid', async () => {
  const host = document.createElement('div');
  const props = reactive({
    companyName: 'Example Company',
    companySiteLink: 'https://example.com/company',
    icp: 'Example ICP',
    icpLink: '',
  });
  const app = createApp({ render: () => h(Copyright, props) });
  app.mount(host);
  const links = () =>
    [...host.querySelectorAll('a')].map((link) => link.getAttribute('href'));

  try {
    expect(links()).toEqual([
      'https://beian.miit.gov.cn/',
      'https://example.com/company',
    ]);

    props.companySiteLink = 'data:text/plain,invalid';
    props.icpLink = '//example.com/invalid';
    await nextTick();
    expect(links()).toEqual([]);
    expect(host.textContent).toContain(props.companyName);
    expect(host.textContent).toContain(props.icp);

    props.companySiteLink = '/company';
    props.icpLink = 'https://example.com/icp';
    await nextTick();
    expect(links()).toEqual(['https://example.com/icp', '/company']);
  } finally {
    app.unmount();
  }
});

import { mount } from '@vue/test-utils';

import { expect, it, vi } from 'vitest';

import ManagementRecordForm from './management-record-form.vue';

vi.mock('#/api', () => ({}));
vi.mock('#/api/system', () => ({}));
vi.mock('#/api/msg', () => ({}));
vi.mock('#/locales', () => ({ $t: (key: string) => key }));
vi.mock('@vben/common-ui', () => ({
  VbenPasswordStrength: { template: '<div />' },
}));
vi.mock('@vben/locales', () => ({ $placeholder: (key: string) => key }));

it.each([
  { reducedMotion: false, behavior: 'smooth' },
  { reducedMotion: true, behavior: 'auto' },
])(
  'scrolls to the first invalid field with $behavior behavior and one message per field',
  async ({ behavior, reducedMotion }) => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const matchMedia = window.matchMedia.bind(window);
    const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const result = matchMedia(query);
      if (query === '(prefers-reduced-motion: reduce)') {
        Object.defineProperty(result, 'matches', { value: reducedMotion });
      }
      return result;
    });
    const credentials = [
      { key: 'username', label: 'Username', type: 'input' },
      { key: 'password', label: 'Password', type: 'password' },
    ] as const;
    const formRules = Object.fromEntries(
      credentials.map(({ key, label }) => [
        key,
        [
          { message: `${label} is required`, required: true },
          {
            async validator() {
              throw new Error(`${label} is required`);
            },
          },
        ],
      ]),
    );
    const wrapper = mount(ManagementRecordForm, {
      props: {
        resource: 'user',
        editorFields: [...credentials],
        formModel: {},
        formRules,
        editingRecord: null,
        submitting: false,
        canUpdate: true,
        canCreate: true,
        canAssignPermissions: true,
        groups: [],
      },
    });

    try {
      await expect(wrapper.vm.validate()).rejects.toMatchObject({
        errorFields: [
          { name: ['username'], errors: ['Username is required'] },
          { name: ['password'], errors: ['Password is required'] },
        ],
      });
      expect(scroll.mock.contexts).toEqual([
        wrapper.get('[data-editor-field="username"]').element,
      ]);
      expect(scroll).toHaveBeenCalledWith({ block: 'end', behavior });
      await vi.waitFor(() => {
        expect(
          wrapper
            .findAll('.ant-form-item-explain-error')
            .map((item) => item.text()),
        ).toEqual(['Username is required', 'Password is required']);
      });
    } finally {
      wrapper.unmount();
      scroll.mockRestore();
      media.mockRestore();
    }
  },
);

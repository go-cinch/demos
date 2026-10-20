import type { FormActions } from '../src/types';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, watch } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFormRuntime } from '../src/form-runtime';

const wrappers: ReturnType<typeof mount>[] = [];

type AsyncValidator = (input: { value: any }) => Promise<string | undefined>;
type MountedFieldOptions = {
  asyncDebounceMs?: number;
  validators: {
    onBlurAsync?: AsyncValidator;
    onChangeAsync?: AsyncValidator;
    onSubmitAsync?: AsyncValidator;
  };
};

function mountRuntime(
  defaultValues: Record<string, any>,
  validator?: AsyncValidator,
  fields?: Record<string, MountedFieldOptions>,
) {
  let form: FormActions | undefined;
  const RuntimeHarness = defineComponent({
    setup() {
      const runtime = useFormRuntime(defaultValues);
      form = runtime;
      const mountedFields =
        fields ??
        (validator
          ? { name: { validators: { onSubmitAsync: validator } } }
          : {});
      return () =>
        h(
          'div',
          Object.entries(mountedFields).map(([name, options]) =>
            h(
              runtime.fieldComponent,
              { name, ...options },
              {
                default: ({ field }: Record<string, any>) =>
                  h('input', {
                    name,
                    'data-validating': String(field.state.meta.isValidating),
                    onBlur: field.handleBlur,
                    onInput: (event: Event) => {
                      const target = event.target;
                      if (target instanceof HTMLInputElement) {
                        field.handleChange(target.value);
                      }
                    },
                    value: field.state.value,
                  }),
              },
            ),
          ),
        );
    },
  });
  const wrapper = mount(RuntimeHarness);
  wrappers.push(wrapper);
  return { form, wrapper };
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    wrapper.unmount();
  }
  vi.useRealTimers();
});

describe('form runtime', () => {
  it('updates values and resets to defaults', async () => {
    const { form } = mountRuntime({ name: 'initial' });
    expect(form).toBeDefined();
    if (!form) return;

    await form.setFieldValue('name', 'updated');
    await nextTick();
    expect(form.values).toEqual({ name: 'updated' });

    await form.reset();
    await nextTick();
    expect(form.values).toEqual({ name: 'initial' });
  });

  it('preserves empty string field updates', async () => {
    const { form, wrapper } = mountRuntime(
      { name: 'initial' },
      async () => undefined,
    );
    expect(form).toBeDefined();
    if (!form) return;

    await wrapper.find('input').setValue('');
    await nextTick();

    expect(form.values).toEqual({ name: '' });
  });

  it('exposes reactive selectors', async () => {
    const { form } = mountRuntime({ name: 'initial' });
    expect(form).toBeDefined();
    if (!form) return;
    const name = form.useSelector((state) => state.values.name);

    await form.setFieldValue('name', 'updated');
    await nextTick();
    expect(name.value).toBe('updated');
  });

  it('updates only changed field value selectors', async () => {
    const { form } = mountRuntime({ email: '', name: 'initial' });
    expect(form).toBeDefined();
    if (!form) return;
    const name = form.useFieldValue('name');
    const selectedValues = form.useFieldValues(['name'] as const);
    const onNameChange = vi.fn();
    const stop = watch(name, onNameChange);

    await form.setFieldValue('email', 'ada@example.com');
    await nextTick();
    expect(onNameChange).not.toHaveBeenCalled();
    expect(selectedValues.value).toEqual(['initial']);

    await form.setFieldValue('name', 'Ada');
    await nextTick();
    expect(onNameChange).toHaveBeenCalledOnce();
    expect(name.value).toBe('Ada');
    expect(selectedValues.value).toEqual(['Ada']);
    stop();
  });

  it('exposes reactive field error selectors', async () => {
    const { form } = mountRuntime({ email: '', name: '' });
    expect(form).toBeDefined();
    if (!form) return;
    const nameError = form.useFieldError('name');
    const onNameErrorChange = vi.fn();
    const stop = watch(nameError, onNameErrorChange);

    form.setFieldError('email', 'Email error');
    await nextTick();
    expect(onNameErrorChange).not.toHaveBeenCalled();

    form.setFieldError('name', 'Name error');
    await nextTick();
    expect(nameError.value).toBe('Name error');
    expect(onNameErrorChange).toHaveBeenCalledOnce();
    stop();
  });

  it('validates mounted fields and clears stale errors', async () => {
    const { form } = mountRuntime({ name: '' }, async ({ value }) => {
      return value ? undefined : 'Name is required';
    });
    expect(form).toBeDefined();
    if (!form) return;

    expect(await form.validate()).toEqual({
      errors: { name: 'Name is required' },
      valid: false,
    });

    await form.setFieldValue('name', 'Ada');
    await flushPromises();
    expect(await form.validateField('name')).toEqual({
      errors: {},
      valid: true,
    });
    expect(form.isFieldValid('name')).toBe(true);
  });

  it('sets and clears manual field errors', async () => {
    const { form } = mountRuntime({ name: '' }, async () => undefined);
    expect(form).toBeDefined();
    if (!form) return;

    form.setFieldError('name', 'Server error');
    await nextTick();
    expect(form.getFieldError('name')).toBe('Server error');
    expect(form.meta.valid).toBe(false);

    form.setFieldError('name');
    await nextTick();
    expect(form.getFieldError('name')).toBeUndefined();
    expect(form.meta.valid).toBe(true);
  });

  it('clears manual errors when resetting the form', async () => {
    const { form } = mountRuntime({ name: '' });
    expect(form).toBeDefined();
    if (!form) return;

    form.setFieldError('name', 'Server error');
    await nextTick();
    expect(form.errors).toEqual({ name: 'Server error' });

    await form.reset();
    await nextTick();
    expect(form.errors).toEqual({});
    expect(form.meta.valid).toBe(true);
  });

  it('invalidates in-flight async validation when clearing validation', async () => {
    let resolveValidation: ((error: string | undefined) => void) | undefined;
    let notifyValidationStarted: (() => void) | undefined;
    const validationStarted = new Promise<void>((resolve) => {
      notifyValidationStarted = resolve;
    });
    const validator = vi.fn(() => {
      notifyValidationStarted?.();
      return new Promise<string | undefined>((resolve) => {
        resolveValidation = resolve;
      });
    });
    const { form } = mountRuntime({ name: '' }, validator);
    expect(form).toBeDefined();
    if (!form) return;

    const pendingValidation = form.validateField('name');
    await validationStarted;
    form.clearValidation();
    resolveValidation?.('Name is already used');
    await pendingValidation;
    await flushPromises();

    expect(form.errors).toEqual({});
    expect(form.meta.validating).toBe(false);
  });

  for (const trigger of ['blur', 'change'] as const) {
    it(`cancels queued ${trigger} validation only for the cleared field and still validates a later submit`, async () => {
      vi.useFakeTimers();
      const nameValidator = vi.fn(async ({ value }: { value: string }) =>
        value ? undefined : 'Name is required',
      );
      const emailValidator = vi.fn(async ({ value }: { value: string }) =>
        value.includes('@') ? undefined : 'Email is invalid',
      );
      const validationKey =
        trigger === 'blur' ? 'onBlurAsync' : 'onChangeAsync';
      const { form, wrapper } = mountRuntime(
        { email: '', name: 'initial' },
        undefined,
        {
          email: {
            asyncDebounceMs: 40,
            validators: {
              [validationKey]: emailValidator,
              onSubmitAsync: emailValidator,
            },
          },
          name: {
            asyncDebounceMs: 40,
            validators: {
              [validationKey]: nameValidator,
              onSubmitAsync: nameValidator,
            },
          },
        },
      );
      expect(form).toBeDefined();
      if (!form) return;
      const fieldValidation = () =>
        ['name', 'email'].map((name) =>
          wrapper.get(`input[name="${name}"]`).attributes('data-validating'),
        );

      for (const name of ['name', 'email']) {
        const input = wrapper.get(`input[name="${name}"]`);
        if (trigger === 'blur') await input.trigger('blur');
        else await input.setValue('changed');
      }
      // Enter TanStack's async scheduling path without executing the delayed
      // validators. Clearing only an already-started promise misses this race.
      await vi.advanceTimersByTimeAsync(0);
      await nextTick();
      expect(nameValidator).not.toHaveBeenCalled();
      expect(emailValidator).not.toHaveBeenCalled();
      expect(fieldValidation()).toEqual(['true', 'true']);
      await form.setFieldValue('name', '');
      form.clearValidation('name');
      await vi.advanceTimersByTimeAsync(40);
      await nextTick();

      expect(nameValidator).not.toHaveBeenCalled();
      expect(emailValidator).toHaveBeenCalledOnce();
      expect(form.errors).toEqual({ email: 'Email is invalid' });
      expect(fieldValidation()).toEqual(['false', 'false']);
      expect(form.meta.validating).toBe(false);

      const onSubmit = vi.fn();
      const submitted = form.handleSubmit(onSubmit)();
      await vi.runAllTimersAsync();
      await submitted;
      await nextTick();
      expect(form.errors).toEqual({
        email: 'Email is invalid',
        name: 'Name is required',
      });
      expect(onSubmit).not.toHaveBeenCalled();
      expect(fieldValidation()).toEqual(['false', 'false']);
      expect(form.meta.validating).toBe(false);
    });
  }

  it('clears only the requested field validation state', async () => {
    const { form } = mountRuntime({ email: '', name: '' });
    expect(form).toBeDefined();
    if (!form) return;

    form.setFieldError('name', 'Name error');
    form.setFieldError('email', 'Email error');
    await nextTick();

    form.clearValidation('name');
    await nextTick();

    expect(form.errors).toEqual({ email: 'Email error' });
  });
});

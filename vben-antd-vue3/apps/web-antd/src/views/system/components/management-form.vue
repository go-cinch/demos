<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';
import type { ValidateErrorEntity } from 'ant-design-vue/es/form/interface';

import { nextTick, ref } from 'vue';

import { Form } from 'ant-design-vue';
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ vertical?: boolean }>(), {
  vertical: false,
});
const form = ref<FormInstance>();

function validate() {
  const instance = form.value;
  return instance?.validate().catch(async (error: ValidateErrorEntity) => {
    if (error?.errorFields?.length && !error.outOfDate) {
      await nextTick();
      if (form.value === instance) {
        const invalidFields = new Set(
          error.errorFields.map(({ name }) => name.join('.')),
        );
        const root: HTMLFormElement = instance.$el;
        const firstInvalidField = [
          ...root.querySelectorAll<HTMLElement>('[data-editor-field]'),
        ].find((field) => invalidFields.has(field.dataset.editorField ?? ''));
        firstInvalidField?.scrollIntoView({
          block: 'end',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
        });
      }
    }
    throw error;
  });
}

defineExpose({
  validate,
  clearValidate: () => form.value?.clearValidate(),
});
</script>
<template>
  <Form
    ref="form"
    :layout="props.vertical ? 'vertical' : 'horizontal'"
    :label-col="props.vertical ? undefined : { span: 6 }"
    :wrapper-col="props.vertical ? undefined : { span: 17 }"
    v-bind="$attrs"
    class="system-editor-form"
  >
    <slot></slot>
  </Form>
</template>
<style scoped>
:deep([data-editor-field]) {
  /* Leave room for Ant Design's deferred validation message. */
  scroll-margin-block-end: 2rem;
}

:deep(.ant-select),
:deep(.ant-picker) {
  width: 100%;
}
</style>

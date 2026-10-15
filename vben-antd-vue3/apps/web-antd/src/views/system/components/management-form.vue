<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';

import { ref } from 'vue';

import { Form } from 'ant-design-vue';
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ vertical?: boolean }>(), {
  vertical: false,
});
const form = ref<FormInstance>();
defineExpose({
  validate: () => form.value?.validate(),
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
:deep(.ant-select),
:deep(.ant-picker) {
  width: 100%;
}
</style>

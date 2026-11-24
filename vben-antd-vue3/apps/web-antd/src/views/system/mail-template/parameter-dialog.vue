<script setup lang="ts">
import type { MailLocale } from '#/api/mail-template';

import { Form, FormItem, Input, Modal } from 'ant-design-vue';

import { $t } from '#/locales';

import { mailLocales } from './content';

const props = defineProps<{
  editing: boolean;
  error: string;
  form: Record<MailLocale, string> & { name: string };
}>();
const emit = defineEmits<{
  name: [value: string];
  sample: [language: MailLocale, value: string];
  confirm: [];
}>();
const open = defineModel<boolean>('open', { required: true });
const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});
</script>

<template>
  <Modal
    v-model:open="open"
    :title="t(editing ? 'setPreview' : 'insertParameter')"
    :ok-text="t(editing ? 'confirm' : 'insert')"
    :cancel-text="t('cancel')"
    :mask-closable="false"
    @ok="emit('confirm')"
  >
    <Form class="parameter-form" layout="horizontal" @submit.prevent>
      <FormItem :label="t('parameterName')">
        <Input
          v-if="!editing"
          :value="props.form.name"
          :aria-label="t('parameterName')"
          :placeholder="t('parameterPlaceholder')"
          @update:value="emit('name', $event)"
        /><code v-else>{{ props.form.name }}</code> </FormItem
      ><FormItem
        v-for="language in mailLocales"
        :key="language"
        :label="t(language === 'zh-CN' ? 'previewValueZh' : 'previewValueEn')"
        :validate-status="error ? 'error' : undefined"
        :help="error ? t(error) : undefined"
      >
        <Input
          :value="props.form[language]"
          @update:value="emit('sample', language, $event)"
          :aria-label="
            t(language === 'zh-CN' ? 'previewValueZh' : 'previewValueEn')
          "
          :placeholder="t('valuePlaceholder')"
          @press-enter="emit('confirm')"
        />
      </FormItem>
    </Form>
  </Modal>
</template>

<style scoped>
.parameter-form {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 24px 12px;
  padding-top: 16px;
}

.parameter-form :deep(.ant-form-item),
.parameter-form :deep(.ant-form-item-row) {
  display: contents;
}

.parameter-form :deep(.ant-form-item-label) {
  align-self: start;
  padding: 0;
}

.parameter-form :deep(.ant-form-item-control) {
  min-width: 0;
}

@media (max-width: 480px) {
  .parameter-form {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .parameter-form :deep(.ant-form-item-label) {
    text-align: start;
  }

  .parameter-form :deep(.ant-form-item-control) {
    margin-bottom: 16px;
  }
}
</style>

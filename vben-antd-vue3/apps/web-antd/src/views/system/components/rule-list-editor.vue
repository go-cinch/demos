<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItemRest, Textarea } from 'ant-design-vue';

import { $t } from '#/locales';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    value?: string;
    label: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { value: '', placeholder: '', disabled: false },
);
const emit = defineEmits<{ 'update:value': [value: string] }>();
const formItem = Form.useInjectFormItemContext();
let nextID = 0;
let lastEmitted: string | undefined;
const rows = ref<{ id: number; text: string }[]>([]);
const inputs = new Map<number, { focus: () => void }>();
watch(
  () => props.value,
  (value) => {
    if (value === lastEmitted) return;
    rows.value = value
      .split(/\r?\n/)
      .filter((text) => text.trim())
      .map((text) => ({ id: ++nextID, text }));
    if (!rows.value.length) rows.value.push({ id: ++nextID, text: '' });
  },
  { immediate: true },
);
function publish() {
  lastEmitted = rows.value.map((row) => row.text).join('\n');
  emit('update:value', lastEmitted);
  formItem.onFieldChange();
}
function change(id: number, text: string) {
  const row = rows.value.find((item) => item.id === id);
  if (row) row.text = text;
  publish();
}
function splitRow(id: number) {
  const index = rows.value.findIndex((row) => row.id === id);
  const row = rows.value[index];
  if (!row || !/[\r\n]/.test(row.text)) return;
  rows.value.splice(
    index,
    1,
    ...row.text
      .split(/\r?\n/)
      .map((text, i) => ({ id: i === 0 ? id : ++nextID, text })),
  );
  publish();
}
async function add() {
  const id = ++nextID;
  rows.value.push({ id, text: '' });
  await nextTick();
  inputs.get(id)?.focus();
}
function remove(id: number) {
  rows.value = rows.value.filter((row) => row.id !== id);
  inputs.delete(id);
  publish();
}
</script>
<template>
  <FormItemRest>
    <div
      v-bind="$attrs"
      class="rule-list-editor"
      :aria-label="label"
      data-testid="rule-list-editor"
    >
      <div v-for="(row, index) in rows" :key="row.id" class="rule-entry">
        <Textarea
          :auto-size="{ minRows: 1, maxRows: 4 }"
          :ref="
            (instance) => {
              if (instance)
                inputs.set(
                  row.id,
                  instance as unknown as { focus: () => void },
                );
            }
          "
          :value="row.text"
          :aria-label="`${label} ${index + 1}`"
          :placeholder="placeholder"
          :disabled="disabled"
          @update:value="change(row.id, $event)"
          @blur="splitRow(row.id)"
        />
        <Button
          :disabled="disabled"
          :aria-label="
            $t('system-editor.removeItem', { name: `${label} ${index + 1}` })
          "
          @click="remove(row.id)"
          >
<IconifyIcon icon="lucide:minus" />
</Button>
      </div>
      <Button
        block
        type="dashed"
        :disabled="disabled"
        class="rule-add"
        @click="add"
        >
<IconifyIcon icon="lucide:plus" />{{
          $t('system-editor.addItem', { entity: label })
        }}
</Button>
    </div>
  </FormItemRest>
</template>
<style scoped>
.rule-list-editor {
  display: grid;
  gap: 10px;
}
.rule-entry {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 10px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.875);
}
.rule-entry :deep(textarea) {
  min-width: 0;
  font:
    13px/1.7 ui-monospace,
    monospace;
}
.rule-entry :deep(.ant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: auto;
  min-height: 32px;
  padding: 0;
  color: hsl(var(--muted-foreground));
}
.rule-entry :deep(.ant-btn:hover:not(:disabled)) {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive));
}
.rule-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  color: hsl(var(--primary));
}
</style>

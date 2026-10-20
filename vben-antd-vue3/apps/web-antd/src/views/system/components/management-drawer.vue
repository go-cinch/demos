<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Drawer } from 'ant-design-vue';

import { $t } from '#/locales';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    entity: string;
    recordId?: number;
    busy?: boolean;
    wide?: boolean;
    width?: string;
    mode?: string;
  }>(),
  { busy: false, wide: false, mode: 'detail', recordId: undefined },
);
const emit = defineEmits<{ close: []; afterOpenChange: [open: boolean] }>();
const body = ref<HTMLElement>();
const heading = ref<HTMLElement>();

// Focus the new mode without remounting the drawer or losing its focus trap.
watch([() => props.mode, () => props.open], async () => {
  await nextTick();
  if (props.open) {
    body.value?.scrollTo({ top: 0 });
    heading.value?.focus({ preventScroll: true });
  }
});
</script>

<template>
  <Drawer
    :open="open"
    :width="width ?? (wide ? 'min(720px, 100vw)' : 'min(600px, 100vw)')"
    placement="right"
    :closable="false"
    destroy-on-close
    :keyboard="!busy"
    :mask-closable="!busy"
    :body-style="{ padding: 0, overflow: 'hidden' }"
    root-class-name="system-record-drawer"
    @close="emit('close')"
    @after-open-change="emit('afterOpenChange', $event)"
  >
    <section
      class="drawer-shell"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      data-testid="management-drawer"
    >
      <header class="drawer-header">
        <div class="drawer-heading" data-testid="management-drawer-heading">
          <div class="drawer-breadcrumb">
            <div>{{ $t('system.menu.system') }}</div>
            <div aria-hidden="true">/</div>
            <div>{{ entity }}</div>
          </div>
          <div class="drawer-title-row">
            <h2 ref="heading" tabindex="-1">{{ title }}</h2>
            <div v-if="recordId !== undefined" class="drawer-record-id">
              #{{ recordId }}
            </div>
          </div>
          <div v-if="$slots.description" class="drawer-description">
            <slot name="description"></slot>
          </div>
          <Button
            class="drawer-close"
            type="text"
            :disabled="busy"
            :aria-label="$t('system-cards.close')"
            @click="emit('close')"
          >
            <IconifyIcon icon="lucide:x" />
          </Button>
        </div>
      </header>
      <div
        ref="body"
        class="drawer-body"
        :data-mode="mode"
        data-testid="management-drawer-body"
        :aria-busy="busy"
      >
        <slot></slot>
      </div>
      <footer class="drawer-footer">
        <div class="drawer-actions"><slot name="footer"></slot></div>
      </footer>
    </section>
  </Drawer>
</template>

<style scoped>
.drawer-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: hsl(var(--card));
}
.drawer-header {
  flex: none;
  padding: 24px 28px 20px;
  border-bottom: 1px solid hsl(var(--border));
}
.drawer-footer {
  flex: none;
  padding: 18px 28px;
  border-top: 1px solid hsl(var(--border));
}

.drawer-heading {
  position: relative;
  color: hsl(var(--foreground));
}
.drawer-breadcrumb {
  display: flex;
  gap: 10px;
  padding-right: 42px;
  margin-bottom: 14px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  font-weight: 400;
}
.drawer-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.drawer-title-row h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.4;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.drawer-title-row h2:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 4px;
}
.drawer-record-id {
  flex: none;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  font-weight: 400;
}
.drawer-description {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 10px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.6;
}
.drawer-description :deep(code) {
  min-width: 0;
  color: hsl(var(--foreground));
  font-family: ui-monospace, monospace;
  overflow-wrap: anywhere;
}
.drawer-close {
  position: absolute;
  top: -8px;
  right: -10px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: hsl(var(--muted-foreground));
}
.drawer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 28px;
  color: hsl(var(--foreground));
}
.drawer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.drawer-actions :deep(.ant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding-inline: 18px;
  border-radius: calc(var(--radius) * 0.875);
}
.drawer-body :deep(.editor-section + .editor-section) {
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid hsl(var(--border));
}
.drawer-body :deep(.editor-section h3) {
  margin: 0 0 20px;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 600;
}
.drawer-body :deep(.ant-form-vertical .ant-form-item) {
  margin-bottom: 22px;
}
.drawer-body :deep(.ant-form-vertical .ant-form-item:last-child) {
  margin-bottom: 0;
}
.drawer-body :deep(.ant-form-vertical .ant-form-item-label > label) {
  height: auto;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.drawer-body :deep(.ant-input),
.drawer-body :deep(.ant-input-affix-wrapper),
.drawer-body :deep(.ant-picker),
.drawer-body :deep(.ant-select-selector) {
  border-radius: calc(var(--radius) * 0.875);
}
.drawer-body :deep(.ant-input:not(textarea)),
.drawer-body :deep(.ant-input-affix-wrapper),
.drawer-body :deep(.ant-picker) {
  min-height: 40px;
}
.drawer-body :deep(.ant-input-affix-wrapper .ant-input) {
  min-height: 0;
}
.drawer-body
  :deep(
    .ant-select-single:not(.ant-select-customize-input) .ant-select-selector
  ) {
  height: 40px;
  align-items: center;
}
.drawer-body :deep(.ant-select-multiple .ant-select-selector) {
  min-height: 40px;
  padding-block: 4px;
}
.drawer-body :deep(.editor-code textarea) {
  font:
    13px/1.8 ui-monospace,
    monospace;
  max-height: 320px;
  overflow: auto;
}
.drawer-body :deep(.editor-switch) {
  display: flex;
  align-items: center;
  gap: 10px;
}
.drawer-body :deep(.editor-note) {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.7;
  margin-top: 8px;
}
.drawer-actions :deep(.editor-dirty) {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-left: auto;
}
@media (max-width: 600px) {
  .drawer-body {
    padding: 22px 20px;
  }
  .drawer-actions :deep(.ant-btn) {
    padding-inline: 12px;
  }
}
</style>

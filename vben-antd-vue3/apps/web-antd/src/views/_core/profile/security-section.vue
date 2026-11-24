<script setup lang="ts">
import { useId } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button } from 'ant-design-vue';

import { $t } from '#/locales';

defineProps<{ title: string; icon: string; action?: string; busy?: boolean }>();
const open = defineModel<boolean>('open', { default: false });
const contentId = useId();
</script>

<template>
  <section class="security-section">
    <div class="security-section-header">
      <span class="security-section-icon"><IconifyIcon :icon="icon" /></span>
      <div class="security-section-heading">
        <div class="security-section-title">
          <h3>{{ title }}</h3>
          <slot name="status"></slot>
        </div>
        <slot name="summary"></slot>
      </div>
      <div class="security-section-actions">
        <slot name="actions">
          <Button
            v-if="action"
            :disabled="busy"
            :aria-expanded="open"
            :aria-controls="contentId"
            @click="open = !open"
          >
            {{ open ? $t('profile-center.collapse') : action }}
          </Button>
        </slot>
      </div>
    </div>
    <div v-show="open" :id="contentId" class="security-section-content">
      <slot name="notice"></slot>
      <div class="security-section-body"><slot></slot></div>
    </div>
  </section>
</template>

<style scoped>
.security-section {
  padding: 24px 26px;
}

.security-section + .security-section {
  border-top: 1px solid hsl(var(--border));
}

.security-section-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.security-section-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 7%);
  border-radius: var(--radius);
}

.security-section-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.security-section-heading {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

.security-section-title {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.security-section-title h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.security-section-title :deep(.ant-tag) {
  margin: 0;
}

.security-section-heading :deep(p) {
  margin: 7px 0 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.security-section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
}

.security-section-content {
  margin: 20px 0 0 46px;
}

.security-section-body {
  max-width: 440px;
}

@media (max-width: 1100px) {
  .security-section-header {
    flex-wrap: wrap;
  }

  .security-section-actions {
    margin-left: auto;
  }
}

@media (max-width: 760px) {
  .security-section {
    padding: 20px 18px;
  }

  .security-section-content {
    margin-left: 0;
  }
}
</style>

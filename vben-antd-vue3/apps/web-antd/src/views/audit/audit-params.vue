<script setup lang="ts">
import type { AuditPayload } from '#/api/audit';

import { computed } from 'vue';

import { $t } from '#/locales';

const props = defineProps<{
  label: string;
  testId: string;
  value?: AuditPayload;
}>();
const formatted = computed(() => {
  if (props.value === null || props.value === undefined) return '';
  return typeof props.value === 'string'
    ? props.value
    : JSON.stringify(props.value, null, 2);
});
</script>

<template>
  <section class="audit-params" :aria-label="label">
    <h4>{{ label }}</h4>
    <pre
      v-if="formatted"
      :data-testid="testId"
      :aria-label="label"
      tabindex="0"
      >{{ formatted }}</pre>
    <p v-else :data-testid="testId" class="text-muted-foreground">
      {{ $t('audit.noParams') }}
    </p>
  </section>
</template>

<style scoped>
.audit-params {
  min-width: 0;
  margin-top: 14px;
}
.audit-params h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
}
.audit-params pre,
.audit-params p {
  margin: 0;
  padding: 10px;
  border-radius: calc(var(--radius) * 0.625);
  background: hsl(var(--muted));
  font-size: 12px;
}
.audit-params pre {
  max-height: 240px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  line-height: 1.6;
}
.audit-params pre:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
</style>

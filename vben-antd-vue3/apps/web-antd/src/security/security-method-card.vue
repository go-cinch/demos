<script setup lang="ts">
import { ChevronRight } from '@vben/icons';

defineProps<{
  action?: boolean;
  description: string;
  disabled?: boolean;
  title: string;
}>();
</script>

<template>
  <component
    :is="action ? 'button' : 'div'"
    class="security-method-card"
    :disabled="action ? disabled : undefined"
    :type="action ? 'button' : undefined"
  >
    <span class="method-icon" aria-hidden="true"
      ><slot name="icon"></slot
    ></span>
    <span class="method-text">
      <strong>{{ title }}</strong>
      <small>{{ description }}</small>
    </span>
    <ChevronRight
      v-if="action"
      class="method-arrow"
      :size="16"
      aria-hidden="true"
    />
  </component>
</template>

<style scoped>
.security-method-card {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  color: hsl(var(--foreground));
  text-align: start;
  background: color-mix(in srgb, hsl(var(--primary)) 4%, hsl(var(--card)));
  border: 1px solid
    color-mix(in srgb, hsl(var(--primary)) 12%, hsl(var(--border)));
  border-radius: var(--radius);
}

button.security-method-card:enabled:hover {
  cursor: pointer;
  border-color: hsl(var(--primary) / 55%);
}

button.security-method-card:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

button.security-method-card:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.method-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
  border-radius: var(--radius);
}

.method-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.method-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.method-text strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.method-text small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 20px;
  color: hsl(var(--muted-foreground));
}

.method-arrow {
  flex: none;
  color: hsl(var(--primary));
}
</style>

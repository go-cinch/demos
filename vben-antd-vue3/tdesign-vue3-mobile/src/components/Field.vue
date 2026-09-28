<script setup lang="ts">
import { computed, onMounted, onUpdated, ref, useId } from 'vue';
import { resolveMessage, type Feedback } from '../lib/form-feedback';
const props = defineProps<{
  label: string;
  name: string;
  error?: Feedback;
  warning?: boolean;
  required?: boolean;
  hint?: string;
}>();
const root = ref<HTMLElement>();
const identity = useId();
const errorText = computed(() => resolveMessage(props.error));
function labelControl() {
  const group = root.value?.querySelector<HTMLElement>('[role="radiogroup"]');
  if (group) {
    group.id = `${identity}-control`;
    group.setAttribute('aria-labelledby', `${identity}-label`);
    return;
  }
  const input = root.value?.querySelector<HTMLElement>('input,textarea,button.select-trigger');
  if (!input) return;
  input.id = `${identity}-control`;
  input.setAttribute('aria-labelledby', `${identity}-label`);
  input.setAttribute('aria-invalid', String(!!errorText.value));
  if (props.required) input.setAttribute('aria-required', 'true');
  if (errorText.value) input.setAttribute('aria-describedby', `${identity}-error`);
  else input.removeAttribute('aria-describedby');
}
onMounted(labelControl);
onUpdated(labelControl);
</script>
<template>
  <div
    ref="root"
    class="field"
    :class="{ 'has-error': !!errorText && !warning, 'has-warning': !!errorText && warning }"
  >
    <label :id="`${identity}-label`" :for="`${identity}-control`"
      >{{ label }}<span v-if="required" aria-hidden="true"> ·</span></label
    ><slot />
    <p v-if="errorText" :id="`${identity}-error`" class="field-error" role="alert">
      {{ errorText }}
    </p>
    <p v-else-if="hint" class="field-hint">{{ hint }}</p>
  </div>
</template>

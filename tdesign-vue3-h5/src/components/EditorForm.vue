<script setup lang="ts">
import { ref } from 'vue';
import { focusFirstInvalid } from '../lib/form-feedback';
withDefaults(defineProps<{ busy?: boolean }>(), { busy: false });
const emit = defineEmits<{ submit: [] }>();
const form = ref<HTMLFormElement>();
defineExpose({ focusInvalid: () => focusFirstInvalid(form.value) });
</script>
<template>
  <form
    ref="form"
    class="editor-form"
    data-testid="record-editor-form"
    novalidate
    :aria-busy="busy"
    @submit.prevent="emit('submit')"
  >
    <fieldset :disabled="busy"><slot /></fieldset>
    <slot name="feedback" />
    <div class="sheet-actions"><slot name="actions" /></div>
  </form>
</template>
<style scoped>
fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
</style>

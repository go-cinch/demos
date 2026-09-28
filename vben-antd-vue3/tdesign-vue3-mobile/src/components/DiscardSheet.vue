<script setup lang="ts">
import Sheet from './Sheet.vue';
import { t } from '../locales';
const visible = defineModel<boolean>({ default: false });
defineEmits<{ decide: [discard: boolean] }>();
</script>
<template>
  <Sheet v-model="visible" :title="t('unsavedTitle')">
    <p>{{ t('unsavedHint') }}</p>
    <div class="sheet-actions">
      <t-button @click="$emit('decide', false)">{{ t('keepEditing') }}</t-button>
      <t-button theme="danger" @click="$emit('decide', true)">{{ t('discard') }}</t-button>
    </div>
  </Sheet>
</template>

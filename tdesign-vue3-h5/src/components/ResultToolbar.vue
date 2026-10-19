<script setup lang="ts">
import Icon from './Icon.vue';
import { t } from '../locales';
withDefaults(defineProps<{ canRead?: boolean }>(), { canRead: true });
const emit = defineEmits<{ refresh: []; options: [string] }>();
</script>
<template>
  <div class="result-toolbar">
    <slot />
    <div v-if="canRead" class="result-tools">
      <button :aria-label="t('system.common.refresh')" @click="emit('refresh')">
        <Icon name="refresh" :size="18" />
      </button>
      <button
        :aria-label="t('system.table.density')"
        @click="emit('options', 'system.table.density')"
      >
        <Icon name="view-list" :size="18" />
      </button>
      <button
        :aria-label="t('system.table.visibleColumns')"
        @click="emit('options', 'system.table.visibleColumns')"
      >
        <Icon name="view-column" :size="18" />
      </button>
      <button :aria-label="t('system.table.style')" @click="emit('options', 'system.table.style')">
        <Icon name="table" :size="18" />
      </button>
    </div>
  </div>
</template>

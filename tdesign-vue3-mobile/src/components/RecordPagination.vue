<script setup lang="ts">
import Icon from './Icon.vue';
import { t } from '../locales';
defineProps<{ page: number; size: number; total: number; loading: boolean }>();
const emit = defineEmits<{ previous: []; next: []; pageSize: [] }>();
</script>
<template>
  <nav class="pagination" :aria-label="t('page', { page })">
    <button
      type="button"
      class="pagination-button"
      :disabled="page <= 1 || loading"
      @click="emit('previous')"
    >
      <Icon name="chevron-left" :size="16" /><span>{{ t('previous') }}</span>
    </button>
    <div class="page-config">
      <span>{{ t('page', { page }) }}</span
      ><button
        type="button"
        :aria-label="t('pageSize')"
        :disabled="loading"
        @click="emit('pageSize')"
      >
        <span>{{ size }} / {{ t('pageUnit') }}</span
        ><Icon name="chevron-down" :size="13" />
      </button>
    </div>
    <button
      type="button"
      class="pagination-button"
      :disabled="page * size >= total || loading"
      @click="emit('next')"
    >
      <span>{{ t('next') }}</span
      ><Icon name="chevron-right" :size="16" />
    </button>
  </nav>
</template>

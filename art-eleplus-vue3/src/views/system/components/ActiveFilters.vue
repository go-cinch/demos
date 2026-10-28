<script setup lang="ts">
  import { computed } from 'vue'
  import { $t, catalogLabel } from '@/locales'
  import { catalogGroupWords } from '@/locales/catalog'
  import { adminFilterChips, type AdminQuery } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  const props = defineProps<{ filters: AdminQuery; editable?: boolean }>(),
    emit = defineEmits<{ change: [AdminQuery] }>(),
    zone = useAdminTimezone()
  const chips = computed(() => {
    // Refresh group labels even when the raw selected filters have not changed.
    void catalogGroupWords()
    return adminFilterChips(
      props.filters,
      zone.value,
      (key, params = {}) => $t(`pc.${key}`, params),
      (key) => catalogLabel('groups', key)
    )
  })
</script>
<template>
  <div v-if="chips.length" class="active-filters" data-testid="active-filters"
    ><ElTag
      v-for="chip in chips"
      :key="chip.key"
      :closable="editable !== false"
      @close="editable !== false && emit('change', chip.clear)"
      >{{ chip.label }}</ElTag
    ></div
  >
</template>
<style scoped>
  .active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .active-filters :deep(.el-tag) {
    height: auto;
    max-width: 100%;
    white-space: normal;
    line-height: 1.6;
    padding: 4px 8px;
  }
</style>

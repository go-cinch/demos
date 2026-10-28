<script setup lang="ts">
  import { ref, watch, onBeforeUnmount } from 'vue'
  import { $t } from '@/locales'
  import { getGroupMembers } from '@/utils/admin/service'
  import type { AdminRecord } from '@/utils/admin/model'
  const props = withDefaults(
    defineProps<{ id: number; removed?: number[]; editable?: boolean }>(),
    { removed: () => [], editable: false }
  )
  const emit = defineEmits<{ remove: [AdminRecord] }>()
  const page = ref(1),
    query = ref(''),
    rows = ref<AdminRecord[]>([]),
    total = ref(0),
    loading = ref(false),
    error = ref(false),
    retry = ref(0)
  let generation = 0,
    timer: ReturnType<typeof setTimeout>
  watch(
    () => [props.id, page.value, query.value, retry.value],
    () => {
      const run = ++generation
      clearTimeout(timer)
      loading.value = true
      error.value = false
      timer = setTimeout(async () => {
        try {
          const result = await getGroupMembers(props.id, {
            p: page.value,
            s: 20,
            q: query.value.trim()
          })
          if (run === generation) {
            rows.value = result.items
            total.value = result.t
          }
        } catch {
          if (run === generation) error.value = true
        } finally {
          if (run === generation) loading.value = false
        }
      }, 200)
    },
    { immediate: true }
  )
  onBeforeUnmount(() => {
    generation++
    clearTimeout(timer)
  })
</script>
<template>
  <section class="member-list" data-testid="group-members"
    ><h3>{{ $t('pc.system-members.count', { count: total }) }}</h3
    ><ElInput
      v-model="query"
      :aria-label="$t('pc.system-editor.searchMember')"
      :placeholder="$t('pc.system-editor.searchMember')"
      clearable
      @input="page = 1" /><ElAlert
      v-if="error"
      :title="$t('pc.system-cards.loadError')"
      type="error"
      :closable="false"
      ><ElButton @click="retry++">{{ $t('pc.system-cards.retry') }}</ElButton></ElAlert
    ><div v-loading="loading" class="member-rows"
      ><div v-for="member in rows" :key="member.id" class="member-row"
        ><span :class="{ removed: removed.includes(member.id) }"
          >{{ member.username }} · {{ member.code }}</span
        ><ElButton
          v-if="editable"
          text
          :aria-label="
            $t(
              removed.includes(member.id) ? 'pc.system-editor.undo' : 'pc.system-editor.removeItem',
              { name: String(member.username) }
            )
          "
          @click="emit('remove', member)"
          >{{
            $t(removed.includes(member.id) ? 'pc.system-editor.undo' : 'pc.system-members.remove')
          }}</ElButton
        ></div
      ><ElEmpty
        v-if="!loading && !rows.length"
        :description="$t('pc.system-cards.noMembers')"
        :image-size="50" /></div
    ><ElPagination
      v-model:current-page="page"
      :total="total"
      :page-size="20"
      layout="total,prev,pager,next"
  /></section>
</template>
<style scoped>
  .member-list {
    display: grid;
    gap: 12px;
  }
  .member-rows {
    min-height: 100px;
  }
  .member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .removed {
    text-decoration: line-through;
    opacity: 0.5;
  }
</style>

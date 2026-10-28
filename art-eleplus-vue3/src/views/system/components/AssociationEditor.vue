<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue'
  import { $t } from '@/locales'
  import { useUserStore } from '@/store/modules/user'
  import { msgApi } from '@/api/msg'
  import { associationOptions } from '@/utils/admin/service'
  import { recordName, type AdminRecord } from '@/utils/admin/model'
  const props = withDefaults(
    defineProps<{
      resource: 'action' | 'user'
      kind?: 'recipient'
      modelValue: Array<string | number>
      seed?: AdminRecord[]
      excludeGroup?: number
    }>(),
    { seed: () => [] }
  )
  const emit = defineEmits<{ 'update:modelValue': [Array<string | number>] }>()
  const open = ref(false),
    query = ref(''),
    page = ref(1),
    rows = ref<AdminRecord[]>([]),
    total = ref(0),
    chosen = ref<Array<string | number>>([]),
    removed = ref<Array<string | number>>([]),
    loading = ref(false),
    error = ref(false),
    retry = ref(0)
  const user = useUserStore(),
    canBrowse = computed(
      () =>
        user.info.buttons?.some(
          (code) =>
            code === '*' ||
            code ===
              (props.kind === 'recipient' ? 'system.msg.send' : `system.${props.resource}.read`)
        ) ?? false
    )
  const cache = new Map<string, AdminRecord>()
  watch(
    () => props.seed,
    (value) => {
      for (const record of value) cache.set(String(key(record)), record)
    },
    { immediate: true }
  )
  const entity = computed(() =>
    $t(
      `pc.system-editor.associations.${props.kind === 'recipient' ? 'recipient' : props.resource === 'action' ? 'action' : 'user'}`
    )
  )
  function key(record: AdminRecord) {
    return props.resource === 'action' ? String(record.code) : record.id
  }
  function label(id: string | number) {
    const record = cache.get(String(id))
    return record
      ? props.kind === 'recipient'
        ? recordName(record)
        : `${recordName(record)} · ${String(record.word ?? record.code ?? '')}`
      : String(id)
  }
  let generation = 0,
    timer: ReturnType<typeof setTimeout>
  watch(
    () => [open.value, query.value, page.value, props.resource, props.excludeGroup, retry.value],
    () => {
      const run = ++generation
      clearTimeout(timer)
      if (!open.value || !canBrowse.value) return
      loading.value = true
      error.value = false
      timer = setTimeout(async () => {
        try {
          const result =
            props.kind === 'recipient'
              ? await msgApi.users(query.value.trim()).then((users) => ({
                  items: users
                    .slice((page.value - 1) * 20, page.value * 20)
                    .map((user) => ({ ...user })),
                  p: page.value,
                  s: 20,
                  t: users.length
                }))
              : await associationOptions(props.resource, {
                  p: page.value,
                  s: 20,
                  q: query.value.trim(),
                  ...(props.excludeGroup ? { exclude_user_group_id: props.excludeGroup } : {})
                })
          if (run !== generation) return
          for (const record of result.items) cache.set(String(key(record)), record)
          rows.value =
            page.value === 1
              ? result.items
              : [...new Map([...rows.value, ...result.items].map((row) => [row.id, row])).values()]
          total.value = result.t
        } catch {
          if (run === generation) error.value = true
        } finally {
          if (run === generation) loading.value = false
        }
      }, 200)
    }
  )
  onBeforeUnmount(() => {
    generation++
    clearTimeout(timer)
  })
  function remove(id: string | number) {
    removed.value = [...new Set([...removed.value, id])]
    emit(
      'update:modelValue',
      props.modelValue.filter((value) => value !== id)
    )
  }
  function toggle(id: string | number) {
    chosen.value = chosen.value.includes(id)
      ? chosen.value.filter((value) => value !== id)
      : [...chosen.value, id]
  }
</script>
<template>
  <div class="association-editor" data-testid="association-editor"
    ><div v-for="id in modelValue" :key="id" class="association-row"
      ><span>{{ label(id) }}</span
      ><ElButton
        text
        :aria-label="$t('pc.system-editor.removeItem', { name: label(id) })"
        @click="remove(id)"
        >{{ $t('pc.system-members.remove') }}</ElButton
      ></div
    ><div
      v-for="id in removed.filter((id) => !modelValue.includes(id))"
      :key="id"
      class="association-row"
      ><span>{{ $t('pc.system-editor.removedItem', { name: label(id) }) }}</span
      ><ElButton text @click="emit('update:modelValue', [...modelValue, id])">{{
        $t('pc.system-editor.undo')
      }}</ElButton></div
    ><ElButton
      class="w-full"
      :disabled="!canBrowse"
      @click="
        () => {
          chosen = []
          query = ''
          page = 1
          open = true
        }
      "
      >{{ $t('pc.system-editor.addItem', { entity }) }}</ElButton
    ><ElDrawer
      v-model="open"
      :title="$t('pc.system-editor.chooseExisting', { entity })"
      size="min(600px,100vw)"
      append-to-body
      destroy-on-close
      ><ElInput
        v-model="query"
        :aria-label="
          $t(
            `pc.system-editor.${kind === 'recipient' ? 'searchRecipient' : resource === 'action' ? 'searchPermission' : 'searchMember'}`
          )
        "
        :placeholder="
          $t(
            `pc.system-editor.${kind === 'recipient' ? 'searchRecipient' : resource === 'action' ? 'searchPermission' : 'searchMember'}`
          )
        "
        clearable
        @input="
          () => {
            page = 1
            rows = []
          }
        "
      /><ElAlert
        v-if="error"
        :title="$t('pc.system-cards.loadError')"
        type="error"
        :closable="false"
        ><ElButton @click="retry++">{{ $t('pc.system-cards.retry') }}</ElButton></ElAlert
      ><div v-loading="loading" class="association-options"
        ><button
          v-for="record in rows"
          :key="record.id"
          type="button"
          :disabled="modelValue.includes(key(record))"
          :aria-pressed="modelValue.includes(key(record)) || chosen.includes(key(record))"
          @click="toggle(key(record))"
          ><strong>{{ recordName(record) }}</strong
          ><small>{{ record.word ?? record.code }}</small
          ><span v-if="modelValue.includes(key(record))">{{
            $t('pc.system-editor.alreadyAdded')
          }}</span
          ><ElTag
            v-if="resource === 'action' && String(record.resource ?? '').includes('*')"
            type="warning"
            >{{ $t('pc.system-editor.highRiskPermission') }}</ElTag
          ></button
        ></div
      ><ElEmpty
        v-if="!loading && !rows.length"
        :description="$t('pc.system-editor.noMatches')"
      /><ElButton v-if="rows.length < total" :loading="loading" @click="page++">{{
        $t('pc.system-editor.loadMore')
      }}</ElButton
      ><template #footer
        ><ElButton
          type="primary"
          :disabled="!chosen.length"
          @click="
            () => {
              emit('update:modelValue', [...new Set([...modelValue, ...chosen])])
              open = false
            }
          "
          >{{ $t('pc.system-editor.addSelected', { count: chosen.length }) }}</ElButton
        ></template
      ></ElDrawer
    ></div
  >
</template>
<style scoped>
  .association-editor {
    display: grid;
    gap: 10px;
    width: 100%;
  }
  .association-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
  }
  .association-options {
    display: grid;
    gap: 10px;
    margin: 18px 0;
    min-height: 100px;
  }
  .association-options button {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 16px;
    text-align: start;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    cursor: pointer;
  }
  .association-options button[aria-pressed='true'] {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  .association-options button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .association-options small {
    font-family: monospace;
    color: var(--el-text-color-secondary);
  }
</style>

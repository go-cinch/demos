<script setup lang="ts">
  import type { AssignmentAction } from './permission-selection'
  import type { ResolvedPermissionSource } from './permission-sources'

  import type {
    ActionResourceBinding,
    PermissionCatalog,
    UserPermissionSource
  } from '@/api/permission-catalog'

  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

  import { Alert, Button, Empty, Segmented, Spin } from '@/components/catalog/element-adapter'

  import { getPermissionCatalog, listActions } from '@/api/permission-catalog'
  import { $t, refreshI18nCatalog } from '@/locales'

  import PermissionResourceEditor from './permission-resource-editor.vue'
  import { actionSelection, normalizeSelection } from './permission-selection'
  import { expandEffectiveSelection } from './permission-sources'
  import { permissionResult } from './permission-result'
  import { menuResourceKeys, resolveResourceBindings } from './resource-catalog'

  const props = withDefaults(
    defineProps<{
      actions?: AssignmentAction[]
      codes?: string[]
      sources?: UserPermissionSource[]
      focusField?: 'button' | 'menu'
    }>(),
    { actions: () => [], codes: () => [] }
  )
  const root = ref<HTMLElement>()
  const highlightedField = ref<'button' | 'menu'>()
  const catalog = ref<PermissionCatalog>()
  const selections = ref<ActionResourceBinding[]>([])
  const scope = ref('admin')
  const loading = ref(false)
  const failed = ref(false)
  const unresolvedCodes = ref<string[]>([])
  const resolvedSources = ref<ResolvedPermissionSource[]>([])
  const sourceFilter = ref<'all' | UserPermissionSource['kind']>('all')
  const sourceOptions = computed(() =>
    ['direct', 'role', 'group', 'all'].map((value: any) => ({
      value,
      label: $t(`permission-display.source.${value}`)
    }))
  )
  const visibleSources = computed(() =>
    resolvedSources.value.filter(
      (source) => sourceFilter.value === 'all' || source.kind === sourceFilter.value
    )
  )
  const visibleCodes = computed(() =>
    props.sources
      ? new Set(
          (props.sources ?? [])
            .filter((source) => sourceFilter.value === 'all' || source.kind === sourceFilter.value)
            .flatMap((source) => [
              ...source.action_codes,
              ...source.actions.map((action) => action.code)
            ])
        )
      : new Set(assignedCodes.value)
  )
  const unresolved = computed(
    () => unresolvedCodes.value.filter((code) => visibleCodes.value.has(code)).length
  )
  const visibleSelections = computed(() =>
    props.sources && catalog.value
      ? normalizeSelection(
          catalog.value.resource_catalog,
          visibleSources.value.flatMap((source) => source.bindings)
        )
      : selections.value
  )
  const sourceNames = computed(() =>
    sourceFilter.value === 'role' || sourceFilter.value === 'group'
      ? (props.sources ?? [])
          .filter((source) => source.kind === sourceFilter.value)
          .map((source) => source.name)
          .join('、')
      : ''
  )
  let request = 0
  const config = computed(() =>
    catalog.value
      ? resolveResourceBindings(
          catalog.value.resource_catalog,
          scope.value,
          visibleSelections.value.filter((item) => item.resource_key.startsWith(`${scope.value}:`))
        )
      : undefined
  )
  const assignedActions = computed(() =>
    props.sources ? props.sources.flatMap((source) => source.actions) : props.actions
  )
  const assignedCodes = computed(() => [
    ...new Set([
      ...(props.sources ? props.sources.flatMap((source) => source.action_codes) : props.codes),
      ...assignedActions.value.map((item) => item.code)
    ])
  ])
  const hasAssignments = computed(() => assignedCodes.value.length > 0)
  async function load() {
    const current = ++request
    catalog.value = undefined
    selections.value = []
    unresolvedCodes.value = []
    resolvedSources.value = []
    failed.value = false
    if (!hasAssignments.value && !props.sources) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const [document] = await Promise.all([
        getPermissionCatalog('scopes,operations,resource_catalog'),
        refreshI18nCatalog()
      ])
      if (current !== request) return
      const definitions = new Map(
        assignedActions.value.filter((item) => item.config).map((item) => [item.code, item])
      )
      const codes = assignedCodes.value
      const missing = codes.filter((code) => !definitions.has(code))
      for (let offset = 0; offset < missing.length; offset += 100) {
        const chunk = missing.slice(offset, offset + 100)
        let page = 1
        while (true) {
          const result = await listActions({
            code: `${chunk.join(',')},`,
            f: 'code,word,config',
            p: page,
            s: 100
          })
          if (current !== request) return
          for (const item of result.items) definitions.set(item.code, item)
          if (result.p * result.s >= result.t) break
          page++
        }
      }
      if (current !== request) return
      const valid: ActionResourceBinding[] = []
      const byCode = new Map<string, ActionResourceBinding[]>()
      const unknown: string[] = []
      for (const code of codes) {
        const definition = definitions.get(code)
        try {
          if (!definition) throw new Error('Missing definition')
          const bindings = actionSelection(document.resource_catalog, definition)
          const effective = props.sources
            ? expandEffectiveSelection(document.resource_catalog, bindings)
            : bindings
          byCode.set(code, effective)
          valid.push(...effective)
        } catch {
          unknown.push(code)
        }
      }
      selections.value = normalizeSelection(document.resource_catalog, valid)
      resolvedSources.value = (props.sources ?? []).map((source) => ({
        ...source,
        bindings: normalizeSelection(
          document.resource_catalog,
          [
            ...new Set([...source.action_codes, ...source.actions.map((item) => item.code)])
          ].flatMap((code) => byCode.get(code) ?? [])
        )
      }))
      unresolvedCodes.value = unknown
      scope.value = selections.value[0]?.resource_key.split(':')[0] ?? document.scopes[0] ?? 'admin'
      catalog.value = document
    } catch {
      if (current === request) failed.value = true
    } finally {
      if (current === request) loading.value = false
    }
  }
  watch(() => [props.actions, props.codes, props.sources], load, { immediate: true, deep: true })
  watch(
    [() => props.focusField, loading, config, scope],
    async ([field], _previous, onCleanup) => {
      let cancelled = false
      let targets: HTMLElement[] = []
      const clearHighlight = () => {
        targets.forEach((target) => target.removeAttribute('data-permission-highlight'))
        highlightedField.value = undefined
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
        clearHighlight()
      })
      highlightedField.value = undefined
      if (!field || loading.value || failed.value || !config.value) return
      await nextTick()
      if (cancelled) return
      if (!catalog.value || !config.value) return
      const result = permissionResult(props.actions[0]?.config ?? config.value)
      const owners = menuResourceKeys(catalog.value.resource_catalog)
      const keys = new Set(
        field === 'menu'
          ? result.menus.map((menu) => owners.get(menu)).filter(Boolean)
          : result.features
      )
      const attribute =
        field === 'menu' ? 'data-permission-resource-key' : 'data-permission-feature-key'
      // Highlight each matching item once, skipping directory aliases and unselected features.
      for (const target of root.value?.querySelectorAll<HTMLElement>(`[${attribute}]`) ?? []) {
        const key = target.getAttribute(attribute) ?? ''
        const item = field === 'button' ? target.closest('.el-checkbox') : target
        if (!item || !keys.delete(key)) continue
        targets.push(item as HTMLElement)
      }
      const first = targets[0]
      const region = first?.closest<HTMLElement>('[data-permission-region]')
      const body = first?.closest<HTMLElement>('.drawer-body')
      if (!first || !region || !body) return
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const scroller = first.closest<HTMLElement>('.resource-tree-area, .selected-resources')
      if (scroller) {
        const scrollTarget =
          field === 'button' ? (first.closest<HTMLElement>('[data-resource-key]') ?? first) : first
        scroller.scrollTo({
          top: Math.max(
            0,
            scroller.scrollTop +
              scrollTarget.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top -
              16
          ),
          behavior: reducedMotion ? 'auto' : 'smooth'
        })
      }
      body.scrollTo({
        top: Math.max(
          0,
          body.scrollTop +
            region.getBoundingClientRect().top -
            body.getBoundingClientRect().top -
            24
        ),
        behavior: reducedMotion ? 'auto' : 'smooth'
      })
      targets.forEach((target) => target.setAttribute('data-permission-highlight', field))
      highlightedField.value = field
      timer = setTimeout(clearHighlight, 2200)
    },
    { immediate: true, flush: 'post' }
  )
  onBeforeUnmount(() => {
    request++
  })
</script>
<template>
  <div
    ref="root"
    class="permission-detail"
    data-testid="permission-detail"
    :data-highlighted-field="highlightedField"
    :aria-busy="loading"
  >
    <div v-if="sources" class="permission-provenance">
      <Segmented
        v-model:value="sourceFilter"
        block
        :options="sourceOptions"
        :aria-label="$t('permission-display.sourceFilter')"
        data-testid="permission-source-filter"
      />
      <p v-if="sourceNames" class="source-names">{{ sourceNames }}</p>
    </div>
    <Alert v-if="failed" type="warning" show-icon :message="$t('permission-display.loadError')"
      ><template #action
        ><Button size="small" @click="load">{{ $t('system-cards.retry') }}</Button></template
      ></Alert
    >
    <Alert
      v-if="!failed && !loading && unresolved"
      class="unresolved"
      type="warning"
      show-icon
      :message="$t('permission-display.unresolved', { count: unresolved })"
    />
    <Empty
      v-if="!hasAssignments && !sources"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      :description="$t('system-cards.noPermissions')"
    />
    <Spin v-else :spinning="loading" :tip="$t('action-editor.catalogLoading')">
      <PermissionResourceEditor
        v-if="catalog && config"
        :key="sourceFilter"
        :catalog="catalog"
        :scope="scope"
        :config="config"
        :effective-view="Boolean(sources)"
        read-only
        @update:scope="scope = $event"
      />
      <div v-else-if="loading" class="permission-loading"></div>
    </Spin>
  </div>
</template>
<style scoped>
  .permission-detail {
    min-width: 0;
  }
  .permission-provenance {
    margin-bottom: 20px;
  }
  .permission-provenance :deep(.ant-segmented-item-label) {
    min-height: 38px;
    line-height: 38px;
    padding-inline: 20px;
  }
  .permission-provenance :deep(.ant-segmented-item-selected) {
    color: var(--el-color-primary);
  }
  .permission-provenance :deep(.ant-segmented-item:has(input:focus-visible)) {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
  }
  .source-names {
    margin: 10px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .permission-detail :deep([data-permission-highlight]) {
    position: relative;
  }
  .permission-detail :deep([data-permission-highlight])::after {
    position: absolute;
    display: block;
    width: auto;
    height: auto;
    z-index: 1;
    inset: -3px;
    pointer-events: none;
    content: '';
    border: 2px solid var(--el-color-primary);
    border-radius: calc(var(--custom-radius) * 0.625);
    animation: permission-item-highlight 2s ease-out 160ms both;
  }
  @keyframes permission-item-highlight {
    0% {
      opacity: 0;
      box-shadow: inset 0 0 0 0 color-mix(in srgb, var(--el-color-primary) 0%, transparent);
    }
    18%,
    55% {
      opacity: 1;
      box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--el-color-primary) 12%, transparent);
    }
    100% {
      opacity: 0;
      box-shadow: inset 0 0 0 8px color-mix(in srgb, var(--el-color-primary) 0%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .permission-detail :deep([data-permission-highlight])::after {
      animation: none;
      box-shadow: none;
    }
  }
  .permission-loading {
    min-height: 240px;
  }
  .unresolved {
    margin-bottom: 16px;
  }
</style>

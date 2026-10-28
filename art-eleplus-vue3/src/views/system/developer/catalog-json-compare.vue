<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { IconifyIcon } from '@/components/catalog/element-adapter'
  import { useClipboard } from '@vueuse/core'
  import { Button, Tooltip, message } from '@/components/catalog/element-adapter'
  import { $t } from '@/locales'
  import type { Catalog, Change } from './catalog-model'
  import type { JsonComparisonBlock } from './catalog-json-comparison'
  import { compareJson } from './catalog-json-comparison'
  import { catalogPathLabel } from './catalog-path-label'

  const props = defineProps<{
    local: Catalog
    online: Catalog
    changes: Change[]
    filterActive: boolean
  }>()
  const t = (key: string) => $t(`developer.${key}`)
  const viewport = ref<HTMLElement>()
  const active = ref<number | null>(null)
  const comparison = computed(() => compareJson(props.local, props.online))
  const matches = (block: JsonComparisonBlock, change: Change) =>
    block.paths.some((path) => change.path.every((part, index) => path[index] === part))
  const navigation = computed(() =>
    props.filterActive
      ? comparison.value.blocks.filter((block) =>
          props.changes.some((change) => matches(block, change))
        )
      : comparison.value.blocks
  )
  const position = computed(() => navigation.value.findIndex((block) => block.id === active.value))
  const activePath = computed(() => {
    const block = navigation.value[position.value]
    if (!block) return []
    const change = props.changes.find((change) => matches(block, change))
    return change?.path ?? block.paths[0] ?? []
  })
  function scrollToActive() {
    const target = viewport.value?.querySelector<HTMLElement>(
      `[data-block-start="${active.value}"]`
    )
    if (target && viewport.value)
      viewport.value.scrollTo({
        top: Math.max(0, target.offsetTop - viewport.value.clientHeight / 4),
        behavior: 'auto'
      })
  }
  watch(
    navigation,
    async (blocks) => {
      if (!blocks.some((block) => block.id === active.value)) active.value = blocks[0]?.id ?? null
      await nextTick()
      scrollToActive()
    },
    { immediate: true }
  )
  async function navigate(direction: -1 | 1) {
    const target = navigation.value[position.value + direction]
    if (!target) return
    active.value = target.id
    await nextTick()
    scrollToActive()
  }
  function keyboardNavigate(event: KeyboardEvent) {
    if (event.key !== 'F7') return
    event.preventDefault()
    void navigate(event.shiftKey ? -1 : 1)
  }
  const { copy } = useClipboard({ legacy: true })
  async function copyJson(value: string) {
    try {
      await copy(value)
      message.success(t('jsonCopied'))
    } catch {
      message.error(t('copyJsonFailed'))
    }
  }
</script>

<template>
  <section
    class="catalog-ide-compare"
    data-testid="catalog-json-comparison"
    :aria-label="t('jsonDiff')"
  >
    <div class="catalog-ide-toolbar">
      <div class="catalog-ide-navigation">
        <Tooltip placement="bottom" :title="t('previousChange')">
          <Button
            type="text"
            size="small"
            :aria-label="t('previousChange')"
            :disabled="position <= 0"
            @click="navigate(-1)"
            ><template #icon><IconifyIcon icon="lucide:arrow-up" /></template
          ></Button>
        </Tooltip>
        <Tooltip placement="bottom" :title="t('nextChange')">
          <Button
            type="text"
            size="small"
            :aria-label="t('nextChange')"
            :disabled="position < 0 || position >= navigation.length - 1"
            @click="navigate(1)"
            ><template #icon><IconifyIcon icon="lucide:arrow-down" /></template
          ></Button>
        </Tooltip>
        <span class="catalog-ide-position" role="status" aria-live="polite">
          {{ t('changePosition') }} {{ position + 1 }} / {{ navigation.length }}
        </span>
      </div>
      <code v-if="position >= 0" class="catalog-ide-path" :title="activePath.join(' / ') || '$'">{{
        catalogPathLabel(activePath)
      }}</code>
      <span v-else class="catalog-muted">{{
        t(comparison.blocks.length ? 'noMatchingDifferences' : 'noDifferences')
      }}</span>
    </div>
    <div
      ref="viewport"
      class="catalog-ide-viewport"
      tabindex="0"
      :aria-label="t('jsonDiff')"
      @keydown="keyboardNavigate"
    >
      <div class="catalog-ide-columns">
        <header class="catalog-ide-column-heading">
          <strong>{{ t('localDraft') }}</strong>
          <div class="catalog-json-heading-actions">
            <span>{{ t('fullJson') }}</span>
            <Tooltip placement="bottom" :mouse-enter-delay="0.5" :title="t('copyJson')">
              <Button
                type="text"
                size="small"
                class="catalog-json-copy"
                :aria-label="t('copyLocalJson')"
                @click="copyJson(comparison.localText)"
                ><template #icon><IconifyIcon icon="lucide:copy" /></template
              ></Button>
            </Tooltip>
          </div>
        </header>
        <div class="catalog-ide-gutter-heading" :aria-label="t('lineNumbers')">
          <span>{{ t('localLine') }}</span
          ><span>{{ t('onlineLine') }}</span>
        </div>
        <header class="catalog-ide-column-heading">
          <strong>{{ t('onlineLatest') }}</strong>
          <div class="catalog-json-heading-actions">
            <span>{{ t('fullJson') }}</span>
            <Tooltip placement="bottom" :mouse-enter-delay="0.5" :title="t('copyJson')">
              <Button
                type="text"
                size="small"
                class="catalog-json-copy"
                :aria-label="t('copyOnlineJson')"
                @click="copyJson(comparison.onlineText)"
                ><template #icon><IconifyIcon icon="lucide:copy" /></template
              ></Button>
            </Tooltip>
          </div>
        </header>
      </div>
      <div
        v-for="(row, index) in comparison.rows"
        :key="index"
        class="catalog-ide-row"
        :class="{
          'catalog-ide-row-current': row.block !== null && row.block === active,
          'catalog-ide-block-start':
            row.block !== null && comparison.blocks[row.block]?.start === index,
          'catalog-ide-block-end': row.block !== null && comparison.blocks[row.block]?.end === index
        }"
        :data-block-start="
          row.block !== null && comparison.blocks[row.block]?.start === index
            ? row.block
            : undefined
        "
        :data-diff-block="row.block ?? undefined"
      >
        <pre
          class="catalog-ide-code catalog-ide-code-local"
          :class="{
            'catalog-ide-line-local': row.block !== null && !!row.local,
            'catalog-ide-line-empty': !row.local
          }"
          :data-local-line="row.local?.number"
        ><span v-for="(token, tokenIndex) in row.local?.tokens" :key="tokenIndex" :class="'catalog-ide-token-' + token.kind">{{ token.text }}</span></pre>
        <div class="catalog-ide-gutter" aria-hidden="true">
          <span>{{ row.local?.number }}</span>
          <span>{{ row.online?.number }}</span>
        </div>
        <pre
          class="catalog-ide-code catalog-ide-code-online"
          :class="{
            'catalog-ide-line-online': row.block !== null && !!row.online,
            'catalog-ide-line-empty': !row.online
          }"
          :data-online-line="row.online?.number"
        ><span v-for="(token, tokenIndex) in row.online?.tokens" :key="tokenIndex" :class="'catalog-ide-token-' + token.kind">{{ token.text }}</span></pre>
      </div>
    </div>
  </section>
</template>

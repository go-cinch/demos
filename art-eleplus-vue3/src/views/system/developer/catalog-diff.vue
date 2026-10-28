<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    Alert,
    Button,
    Empty,
    Input,
    Pagination,
    RadioButton,
    RadioGroup,
    Select,
    Tag
  } from '@/components/catalog/element-adapter'
  import type { Catalog, Change, Conflict, EditorUI, Problem } from './catalog-model'
  import { assign, merge, messageCategories, stable, validate } from './catalog-model'
  import { $t } from '@/locales'
  import { formatDateTime } from '@/components/catalog/runtime'
  import CatalogJsonCompare from './catalog-json-compare.vue'
  import { catalogPathLabel } from './catalog-path-label'
  import { pendingGroupRenames } from '../components/action-group-model'
  import { pendingResourceRenames } from './resource-renames'
  const props = defineProps<{
    base: Catalog
    document: Catalog
    online: Catalog
    ui: EditorUI
    changes: Change[]
    conflicts: Conflict[]
    problems: Problem[]
    fetchedAt: number
    disabled: boolean
    loading: boolean
  }>()
  const emit = defineEmits<{ refresh: []; rebase: [Catalog]; export: [] }>()
  const t = (key: string) => $t(`developer.${key}`)
  const groupRenames = computed(() =>
    Object.entries(pendingGroupRenames(props.online, props.document, props.ui.groupRenames))
  )
  const resourceRenames = computed(() => {
    const renames = pendingResourceRenames(
      props.online,
      props.document,
      props.ui.resourceRenames,
      props.ui.featureRenames
    )
    return [
      ...Object.entries(renames.resources).map(([from, to]) => ({ kind: 'resources', from, to })),
      ...Object.entries(renames.features).map(([from, to]) => ({ kind: 'features', from, to }))
    ]
  })
  const page = ref(1)
  const error = ref('')
  const errorPath = ref('')
  const errorText = computed(() =>
    error.value ? [t(error.value), errorPath.value].filter(Boolean).join(' · ') : ''
  )
  function display(value: unknown) {
    if (value === undefined) return '—'
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
  }
  function actionLabel(change: Change) {
    return t(
      change.kind === 'added' ? 'undoAdd' : change.kind === 'deleted' ? 'restore' : 'useOnline'
    )
  }
  const filtered = computed(() =>
    props.changes.filter(
      (c) =>
        (!props.ui.diffKind || c.kind === props.ui.diffKind) &&
        (!props.ui.diffQuery ||
          (catalogPathLabel(c.path) + c.path.join(' / ') + stable(c.before) + stable(c.after))
            .toLocaleLowerCase()
            .includes(props.ui.diffQuery.toLocaleLowerCase()))
    )
  )
  const rows = computed(() => filtered.value.slice((page.value - 1) * 30, page.value * 30))
  watch(filtered, (changes) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(changes.length / 30)))
  })
  const snapshot = computed(() => stable(props.online))
  const choice = (c: Conflict) =>
    props.ui.resolutionSnapshot === snapshot.value
      ? props.ui.resolutions[JSON.stringify(c.path)]
      : undefined
  const unresolved = computed(() => props.conflicts.filter((c) => !choice(c)?.choice).length)
  function choose(c: Conflict, mode: string) {
    if (props.ui.resolutionSnapshot !== snapshot.value) props.ui.resolutions = {}
    props.ui.resolutionSnapshot = snapshot.value
    props.ui.resolutions[JSON.stringify(c.path)] = {
      choice: mode,
      custom: typeof c.after === 'string' ? c.after : JSON.stringify(c.after ?? null, null, 2)
    }
  }
  function applyMerge() {
    const next = merge(props.base, props.document, props.online).document
    for (const c of props.conflicts) {
      const resolved = choice(c)
      if (!resolved) return
      let value = resolved.choice === 'online' ? c.before : c.after
      if (resolved.choice === 'custom') {
        try {
          value =
            typeof c.after === 'string' || typeof c.before === 'string'
              ? resolved.custom
              : JSON.parse(resolved.custom)
        } catch {
          error.value = 'invalidJson'
          return
        }
      }
      assign(next, c.path, value)
    }
    const problems = validate(next).filter((p) => !p.warning)
    if (problems.length > 0) {
      error.value = 'validationFailed'
      errorPath.value = problems[0]?.path.join(' / ') ?? ''
      return
    }
    emit('rebase', next)
    props.ui.resolutions = {}
    error.value = ''
    errorPath.value = ''
  }
  function locate(problem: Problem) {
    const path = problem.path
    if (path[0] === 'locales' || path[0] === 'default_locale') {
      props.ui.tab = 'languages'
    } else if (path[0] === 'scopes') {
      props.ui.tab = 'scopes'
    } else if (
      path[0] === 'group_order' ||
      (path[0] === 'messages' && path[2] === 'frontend' && path[3] === 'groups')
    ) {
      props.ui.tab = 'groups'
    } else if (path[0] === 'messages') {
      props.ui.tab = 'messages'
      const categoryIndex = messageCategories.includes(path[1] ?? '') ? 1 : 2
      props.ui.category = path[categoryIndex] === 'backend' ? 'backend' : 'frontend'
      props.ui.messageQuery = path.slice(categoryIndex + 1).join('.')
      props.ui.messagePage = 1
    } else if (path[1] === 'resources') {
      props.ui.tab = 'resources'
      props.ui.resource = path[2] ?? ''
      props.ui.scope = props.ui.resource.split(':')[0] ?? 'admin'
    } else {
      props.ui.tab = 'resources'
    }
  }
</script>
<template>
  <div class="catalog-card">
    <div class="catalog-row">
      <div>
        <h3>{{ t('versionCompare') }}</h3>
        <p class="catalog-muted">{{ t('compareHint') }}</p>
      </div>
      <Button
        data-permission-key="admin:btn:system:developer:refresh"
        :loading="loading"
        @click="emit('refresh')"
        >{{ t('fetchOnline') }}</Button
      >
    </div>
    <div class="catalog-snapshots">
      <span>{{ t('localDraft') }}</span>
      <span>{{ t('onlineLatest') }} · {{ formatDateTime(fetchedAt) }}</span>
    </div>
    <Alert type="info" show-icon :message="t('refreshKeepsDraft')" />
  </div>
  <div v-if="conflicts.length" class="catalog-card" data-testid="catalog-conflicts">
    <Alert type="warning" show-icon :message="t('conflictHint') + ' · ' + conflicts.length" />
    <div class="catalog-row">
      <h3>{{ t('resolveConflicts') }}</h3>
      <Tag :color="unresolved ? 'red' : 'green'">{{ t('unresolved') }} {{ unresolved }}</Tag>
    </div>
    <article v-for="c in conflicts" :key="JSON.stringify(c.path)" class="catalog-conflict">
      <strong class="catalog-path" :title="c.path.join(' / ')">{{
        catalogPathLabel(c.path)
      }}</strong>
      <div class="catalog-three">
        <div>
          <label>{{ t('localDraft') }}</label>
          <pre class="catalog-new">{{ display(c.after) }}</pre>
        </div>
        <div>
          <label>{{ t('editBase') }}</label>
          <pre>{{ display(c.base) }}</pre>
        </div>
        <div>
          <label>{{ t('onlineLatest') }}</label>
          <pre class="catalog-old">{{ display(c.before) }}</pre>
        </div>
      </div>
      <RadioGroup
        :value="choice(c)?.choice"
        :disabled="disabled"
        @change="(event: any) => choose(c, event.target.value)"
      >
        <RadioButton value="local">{{ t('keepLocal') }}</RadioButton
        ><RadioButton value="online">{{ t('useOnline') }}</RadioButton
        ><RadioButton value="custom">{{ t('manualEdit') }}</RadioButton>
      </RadioGroup>
      <Input.TextArea
        v-if="choice(c)?.choice === 'custom'"
        v-model:value="ui.resolutions[JSON.stringify(c.path)]!.custom"
        :disabled="disabled"
        :aria-label="t('mergeResult')"
        :auto-size="{ minRows: 2, maxRows: 8 }"
      />
    </article>
    <p v-if="error" role="alert" class="catalog-error">{{ errorText }}</p>
    <div class="catalog-row">
      <span>{{ t('mergeHint') }}</span
      ><Button type="primary" :disabled="disabled || unresolved > 0" @click="applyMerge">{{
        t('applyMerge')
      }}</Button>
    </div>
  </div>
  <div class="catalog-card catalog-comparison">
    <Alert
      v-if="resourceRenames.length"
      class="catalog-group-renames"
      type="info"
      show-icon
      :message="t('resourceIdentifierChanges')"
    >
      <template #description>
        <p>{{ t('resourceIdentifierChangesHint') }}</p>
        <ul>
          <li v-for="change in resourceRenames" :key="change.kind + change.from">
            <span>{{ t(change.kind) }}</span
            ><code>{{ change.from }}</code
            ><span>→</span><code>{{ change.to }}</code>
          </li>
        </ul>
      </template>
    </Alert>
    <Alert
      v-if="groupRenames.length"
      class="catalog-group-renames"
      type="info"
      show-icon
      :message="t('groupIdentifierChanges')"
    >
      <template #description>
        <p>{{ t('groupIdentifierChangesHint') }}</p>
        <ul>
          <li v-for="[from, to] in groupRenames" :key="from">
            <code>{{ from }}</code
            ><span>→</span><code>{{ to }}</code>
          </li>
        </ul>
      </template>
    </Alert>
    <div class="catalog-filter">
      <Input
        v-model:value="ui.diffQuery"
        :aria-label="t('searchDiff')"
        :placeholder="t('searchDiff')"
        allow-clear
        @update:value="page = 1"
      />
      <Select
        v-model:value="ui.diffKind"
        :options="
          ['', 'added', 'changed', 'deleted'].map((value: any) => ({
            value,
            label:
              t(value || 'all') +
              ' ' +
              (value ? changes.filter((c) => c.kind === value).length : changes.length)
          }))
        "
        @change="page = 1"
      />
      <RadioGroup v-model:value="ui.jsonDiff"
        ><RadioButton :value="false">{{ t('structuredDiff') }}</RadioButton
        ><RadioButton :value="true">{{ t('jsonDiff') }}</RadioButton></RadioGroup
      >
    </div>
    <template v-if="ui.jsonDiff">
      <p class="catalog-muted catalog-json-hint">{{ t('jsonCompareHint') }}</p>
      <CatalogJsonCompare
        :local="document"
        :online="online"
        :changes="filtered"
        :filter-active="!!ui.diffQuery || !!ui.diffKind"
      />
    </template>
    <template v-else>
      <div class="catalog-diff-head">
        <span>{{ t('field') }}</span>
        <span>{{ t('localDraft') }}</span>
        <span>{{ t('onlineLatest') }}</span>
        <span>{{ t('actions') }}</span>
      </div>
      <div
        v-for="c in rows"
        :key="JSON.stringify(c.path)"
        class="catalog-diff-row"
        data-testid="catalog-diff-row"
        :data-change-kind="c.kind"
      >
        <div>
          <Tag :color="c.kind === 'added' ? 'green' : c.kind === 'deleted' ? 'red' : 'blue'">{{
            t(c.kind)
          }}</Tag
          ><code class="catalog-path" :title="c.path.join(' / ')">{{
            catalogPathLabel(c.path)
          }}</code>
        </div>
        <pre class="catalog-new">{{ display(c.after) }}</pre>
        <pre class="catalog-old">{{ display(c.before) }}</pre>
        <Button
          type="link"
          :disabled="disabled || !!ui.buffer"
          @click="assign(document, c.path, c.before)"
          >{{ actionLabel(c) }}</Button
        >
      </div>
      <Empty
        v-if="!filtered.length"
        :description="t(changes.length ? 'noMatchingDifferences' : 'noDifferences')"
      />
      <Pagination
        v-if="filtered.length > 30"
        v-model:current="page"
        :total="filtered.length"
        :page-size="30"
        :show-size-changer="false"
      />
    </template>
  </div>
  <div class="catalog-card">
    <div class="catalog-row">
      <h3>{{ t('validation') }}</h3>
      <Tag :color="problems.some((p) => !p.warning) ? 'red' : 'green'"
        >{{ t('errors') }} {{ problems.filter((p) => !p.warning).length }} · {{ t('warnings') }}
        {{ problems.filter((p) => p.warning).length }}</Tag
      >
    </div>
    <p class="catalog-muted">{{ t('validationHint') }}</p>
    <div v-for="(problem, i) in problems.slice(0, 30)" :key="i" class="catalog-row catalog-feature">
      <span :class="problem.warning ? 'catalog-warning' : 'catalog-error'"
        >{{ t(problem.code) }} · <code>{{ problem.path.join(' / ') }}</code></span
      ><Button type="link" @click="locate(problem)">{{ t('locate') }}</Button>
    </div>
    <p v-if="!problems.length" class="catalog-success">{{ t('valid') }}</p>
    <p v-if="problems.length > 30" class="catalog-muted">
      {{ t('moreProblems') }} {{ problems.length - 30 }}
    </p>
  </div>
</template>

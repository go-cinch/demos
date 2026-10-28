<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import { onBeforeRouteLeave, useRoute } from 'vue-router'
  import { Page } from '@/components/catalog/element-adapter'
  import { IconifyIcon } from '@/components/catalog/element-adapter'
  import { formatDateTime } from '@/components/catalog/runtime'
  import { registerTabCloseGuard } from '@/components/catalog/runtime'
  import {
    Alert,
    Button,
    Drawer,
    Empty,
    Modal,
    Result,
    Skeleton,
    Tabs,
    TabPane,
    Tag,
    message
  } from '@/components/catalog/element-adapter'
  import { $t } from '@/locales'
  import { useAuthStore } from '@/components/catalog/runtime'
  import CatalogResources from './catalog-resources.vue'
  import CatalogGroups from './catalog-groups.vue'
  import CatalogMessages from './catalog-messages.vue'
  import CatalogScopes from './catalog-scopes.vue'
  import CatalogLanguages from './catalog-languages.vue'
  import CatalogDiff from './catalog-diff.vue'
  import { isCatalog, normalizeCatalog } from './catalog-model'
  import { repairResourcePreviewDraft } from './resource-preview'
  import type { Catalog } from './catalog-model'
  import { useCatalogDraft } from './use-catalog-draft'
  import { legacyGroupRenames } from '../components/action-group-model'
  import { legacyResourceRenames, pendingResourceRenames, readRenameMap } from './resource-renames'

  const t = (key: string) => $t(`developer.${key}`)
  const draft = useCatalogDraft()
  const { state, canEdit, canReadDeveloper, changes, pending, conflicts, problems } = draft
  const content = ref<HTMLElement>()
  async function refreshGroupCatalog() {
    if (
      !canEdit.value ||
      state.draft?.ui.resourceEditor ||
      state.draft?.ui.groupEditor ||
      state.draft?.ui.buffer ||
      !(await draft.refresh()) ||
      !state.draft ||
      !state.online
    )
      return
    draft.mergeOnlineUpdates()
  }
  const draftInfo = ref(false)
  const importFile = ref<HTMLInputElement>()
  const errors = computed(() => problems.value.filter((p) => !p.warning))
  let confirmingNavigation = false
  async function navigate(action: () => void): Promise<boolean> {
    const ui = state.draft?.ui
    if (!ui?.resourceEditor) {
      action()
      return true
    }
    if (confirmingNavigation) return false
    confirmingNavigation = true
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: t('unsavedNodeTitle'),
        content: t('unsavedNodeHint'),
        okText: t('discardAndLeave'),
        cancelText: t('continue'),
        okButtonProps: { danger: true },
        onOk() {
          ui.resourceEditor = null
          confirmingNavigation = false
          action()
          resolve(true)
        },
        onCancel() {
          confirmingNavigation = false
          resolve(false)
        }
      })
    })
  }
  function selectTab(key: string | number) {
    if (state.draft?.ui.tab === String(key)) return
    void navigate(() => {
      if (state.draft) state.draft.ui.tab = String(key)
    })
  }
  onBeforeRouteLeave((to) => to.path.startsWith('/auth/') || navigate(() => {}))
  const unregisterCloseGuard = registerTabCloseGuard(useRoute().path, () => navigate(() => {}))
  onBeforeUnmount(unregisterCloseGuard)
  function beforeUnload(event: BeforeUnloadEvent) {
    if (canReadDeveloper.value && state.draft?.ui.resourceEditor) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
  watch(
    () => state.ready,
    async (ready) => {
      if (ready) {
        await nextTick()
        if (content.value && state.draft) content.value.scrollTop = state.draft.ui.scroll
      }
    }
  )
  function confirmDiscard() {
    Modal.confirm({
      title: t('discardConfirm'),
      content: t('discardHint'),
      okText: t('discard'),
      cancelText: t('cancel'),
      okButtonProps: { danger: true },
      onOk: draft.discard
    })
  }
  async function submit() {
    if (state.draft?.ui.resourceEditor || state.draft?.ui.groupEditor) return
    if (!(await draft.refresh()) || !state.draft) return
    if (conflicts.value.length > 0 || errors.value.length > 0) {
      state.draft.ui.tab = 'diff'
      return
    }
    Modal.confirm({
      title: t('submitConfirm'),
      content: `${t('submitConfirmHint')} ${changes.value.length}`,
      okText: t('submit'),
      cancelText: t('cancel'),
      async onOk() {
        if (await draft.publish()) {
          message.success(t('submitSuccess'))
          await useAuthStore().fetchUserInfo({ fresh: true })
        }
      }
    })
  }
  function openDiff() {
    void navigate(() => {
      if (state.draft) state.draft.ui.tab = 'diff'
      void draft.refresh()
    })
  }
  async function importDraft(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file || !state.draft || !canEdit.value) return
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('size')
      const data: unknown = JSON.parse(await file.text())
      let imported: Catalog | undefined
      let groupRenames: Record<string, string> = {}
      let resourceRenames: Record<string, string> = {}
      let featureRenames: Record<string, string> = {}
      if (isCatalog(data)) imported = data
      else if (typeof data === 'object' && data && 'document' in data && isCatalog(data.document)) {
        imported = data.document
        if ('ui' in data && data.ui && typeof data.ui === 'object') {
          const ui = data.ui as Record<string, unknown>
          resourceRenames = readRenameMap(ui.resourceRenames)
          featureRenames = readRenameMap(ui.featureRenames)
        }
        if (
          'ui' in data &&
          data.ui &&
          typeof data.ui === 'object' &&
          'groupRenames' in data.ui &&
          data.ui.groupRenames &&
          typeof data.ui.groupRenames === 'object' &&
          !Array.isArray(data.ui.groupRenames)
        ) {
          const entries = Object.entries(data.ui.groupRenames)
          if (entries.some(([, value]) => typeof value !== 'string'))
            throw new Error('groupRenames')
          groupRenames = Object.fromEntries(entries) as Record<string, string>
        }
      }
      if (!imported) throw new Error('schema')
      groupRenames = { ...legacyGroupRenames(state.draft.base, imported), ...groupRenames }
      const renames = legacyResourceRenames(state.draft.base, imported)
      resourceRenames = { ...renames.resources, ...resourceRenames }
      featureRenames = { ...renames.features, ...featureRenames }
      const pendingRenames = pendingResourceRenames(
        state.draft.base,
        imported,
        resourceRenames,
        featureRenames
      )
      resourceRenames = pendingRenames.resources
      featureRenames = pendingRenames.features
      Modal.confirm({
        title: t('importConfirm'),
        content: t('importHint'),
        okText: t('import'),
        cancelText: t('cancel'),
        onOk() {
          if (state.draft) {
            state.draft.document = repairResourcePreviewDraft(
              normalizeCatalog(imported),
              state.draft.base,
              state.online ?? state.draft.base
            )
            state.draft.ui.groupRenames = groupRenames
            state.draft.ui.resourceRenames = resourceRenames
            state.draft.ui.featureRenames = featureRenames
            state.draft.ui.buffer = null
            state.draft.ui.resourceEditor = null
            state.draft.ui.groupEditor = null
            state.draft.ui.tab = 'diff'
          }
        }
      })
    } catch {
      message.error(t('importFailed'))
    } finally {
      if (importFile.value) importFile.value.value = ''
    }
  }
  async function useExternal() {
    if (await navigate(() => {})) await draft.initialize()
  }
</script>
<template>
  <Page :title="t('title')" :description="t('subtitle')" content-class="developer-page">
    <Result
      v-if="!canReadDeveloper"
      status="403"
      :title="t('restricted')"
      :sub-title="t('restrictedHint')"
    />
    <template v-else>
      <div class="catalog-toolbar">
        <div class="catalog-draft-state">
          <span
            role="status"
            aria-live="polite"
            data-testid="draft-status"
            :class="state.storageError || state.external ? 'catalog-error' : 'catalog-success'"
          >
            <IconifyIcon
              :icon="
                state.storageError || state.external ? 'lucide:circle-alert' : 'lucide:circle-check'
              "
            />{{
              t(
                state.external
                  ? 'externalDraft'
                  : state.storageError
                    ? 'saveFailed'
                    : 'savedLocally'
              )
            }}
          </span>
          <small v-if="state.draft?.savedAt">
            {{ t('lastSaved') }} {{ formatDateTime(state.draft.savedAt) }}
          </small>
        </div>
        <div class="catalog-actions">
          <Button :disabled="!state.draft" @click="draftInfo = true">
            <template #icon><IconifyIcon icon="lucide:file-pen-line" /></template>
            {{ t('localDraft') }}
          </Button>
          <Button
            :disabled="!state.draft || state.loading"
            data-testid="compare-online"
            data-permission-key="admin:btn:system:developer:compare-online"
            @click="openDiff"
          >
            <template #icon><IconifyIcon icon="lucide:git-compare-arrows" /></template>
            {{ t('compareOnline') }}
            <span class="catalog-change-count">{{ changes.length }}</span>
          </Button>
          <Button
            type="primary"
            data-permission-key="admin:btn:system:developer:publish"
            :loading="state.publishing"
            :disabled="
              !canEdit ||
              state.storageError ||
              !state.online ||
              !!state.draft?.ui.buffer ||
              !!state.draft?.ui.resourceEditor ||
              !!state.draft?.ui.groupEditor ||
              !changes.length
            "
            data-testid="submit-catalog"
            @click="submit"
          >
            <template #icon><IconifyIcon icon="lucide:upload" /></template>
            {{ t('submit') }}
          </Button>
        </div>
      </div>
      <Alert
        v-if="state.restored"
        type="success"
        show-icon
        closable
        :message="t('restored')"
        @close="state.restored = false"
      />
      <Alert v-if="state.error" type="error" show-icon :message="t(state.error)"
        ><template #action
          ><Button
            :loading="state.loading"
            @click="state.ready ? draft.refresh() : draft.initialize()"
            >{{ t('retry') }}</Button
          ></template
        ></Alert
      >
      <Alert
        v-if="state.storageError && !state.external"
        type="error"
        show-icon
        :message="t('storageFailedHint')"
        ><template #action
          ><Button @click="draft.persist">{{ t('retry') }}</Button
          ><Button @click="draft.exportDraft">{{ t('exportDraft') }}</Button></template
        ></Alert
      >
      <Alert v-if="state.external" type="warning" show-icon :message="t('externalHint')"
        ><template #action
          ><Button @click="draft.exportDraft">{{ t('exportMine') }}</Button
          ><Button data-testid="load-external-draft" @click="useExternal">{{
            t('loadExternal')
          }}</Button></template
        ></Alert
      >
      <Skeleton v-if="state.loading && !state.draft" active :paragraph="{ rows: 12 }" />
      <div
        v-if="state.draft"
        ref="content"
        class="catalog-content"
        @scroll="(event: any) => (state.draft!.ui.scroll = (event.target as HTMLElement).scrollTop)"
      >
        <Tabs
          :active-key="state.draft.ui.tab"
          :animated="false"
          class="catalog-tabs"
          @change="selectTab"
        >
          <TabPane tab-key="languages">
            <template #tab
              ><span class="catalog-tab-label"
                ><IconifyIcon icon="lucide:languages" />{{ t('languages') }}</span
              ></template
            >
            <CatalogLanguages :catalog="state.draft.document" :disabled="!canEdit" />
          </TabPane>
          <TabPane tab-key="scopes">
            <template #tab>
              <span class="catalog-tab-label">
                <IconifyIcon icon="lucide:layers" />{{ t('scopes') }}
              </span>
            </template>
            <CatalogScopes
              :catalog="state.draft.document"
              :ui="state.draft.ui"
              :disabled="!canEdit"
            />
          </TabPane>
          <TabPane tab-key="resources">
            <template #tab
              ><span class="catalog-tab-label"
                ><IconifyIcon icon="lucide:folder-tree" />{{ t('resources') }}</span
              ></template
            >
            <CatalogResources
              :catalog="state.draft.document"
              :ui="state.draft.ui"
              :disabled="!canEdit"
              :navigate="navigate"
          /></TabPane>
          <TabPane tab-key="groups">
            <template #tab
              ><span class="catalog-tab-label"
                ><IconifyIcon icon="lucide:folder-key" />{{ t('permissionGroups') }}</span
              ></template
            >
            <CatalogGroups
              :base="state.draft.base"
              :catalog="state.draft.document"
              :ui="state.draft.ui"
              v-model:renames="state.draft.ui.groupRenames"
              :active="state.draft.ui.tab === 'groups'"
              :disabled="!canEdit"
              @update:catalog="state.draft.document = $event"
              @refresh-catalog="refreshGroupCatalog"
            />
          </TabPane>
          <TabPane tab-key="messages">
            <template #tab
              ><span class="catalog-tab-label"
                ><IconifyIcon icon="lucide:message-square-text" />{{ t('messages') }}</span
              ></template
            >
            <CatalogMessages
              :catalog="state.draft.document"
              :ui="state.draft.ui"
              :disabled="!canEdit"
              @open-resources="selectTab('resources')"
          /></TabPane>
          <TabPane tab-key="diff">
            <template #tab
              ><span class="catalog-tab-label"
                ><IconifyIcon icon="lucide:git-compare-arrows" />{{ t('diff') }}</span
              ></template
            >
            <CatalogDiff
              v-if="state.online"
              :base="state.draft.base"
              :document="state.draft.document"
              :online="state.online"
              :ui="state.draft.ui"
              :changes="changes"
              :conflicts="conflicts"
              :problems="problems"
              :fetched-at="state.fetchedAt"
              :disabled="!canEdit"
              :loading="state.loading"
              @refresh="draft.refresh"
              @rebase="draft.rebase"
              @export="draft.exportDraft"
            />
            <Empty v-else :description="t('loadFailed')"
              ><Button @click="draft.refresh">{{ t('retry') }}</Button></Empty
            >
          </TabPane>
        </Tabs>
      </div>
      <div v-if="state.draft" class="catalog-bottom">
        <span class="catalog-local-hint"
          ><IconifyIcon icon="lucide:hard-drive" aria-hidden="true" />{{ t('localOnlyHint') }}</span
        >
        <div class="catalog-health">
          <span
            >{{ t('pending') }} <strong>{{ pending.length }}</strong></span
          >
          <span :class="{ 'catalog-error': errors.length }"
            >{{ t('errors') }} <strong>{{ errors.length }}</strong></span
          >
          <span :class="{ 'catalog-warning': conflicts.length }"
            >{{ t('conflicts') }} <strong>{{ conflicts.length }}</strong></span
          >
        </div>
      </div>
      <Drawer :open="draftInfo" :title="t('localDraft')" :width="480" @close="draftInfo = false">
        <div class="catalog-editor">
          <div class="catalog-actions"> <Tag>I18N_CATALOG</Tag><Tag>schema v2</Tag> </div>
          <Alert
            :type="state.storageError ? 'error' : 'success'"
            show-icon
            :message="t(state.storageError ? 'saveFailed' : 'savedLocally')"
          />
          <p>
            {{ t('lastSaved') }}<br />{{
              state.draft?.savedAt ? formatDateTime(state.draft.savedAt) : '—'
            }}
          </p>
          <p>{{ t('pending') }} {{ pending.length }}</p>
          <h3>{{ t('restoreIncludes') }}</h3>
          <ul>
            <li>{{ t('restoreFields') }}</li>
            <li>{{ t('restoreNavigation') }}</li>
            <li>{{ t('restoreEditor') }}</li>
          </ul>
          <p class="catalog-muted">{{ t('storageIsolation') }}</p>
          <div class="catalog-actions">
            <Button @click="draft.exportDraft">{{ t('exportDraft') }}</Button
            ><Button :disabled="!canEdit" @click="importFile?.click()">{{ t('import') }}</Button>
          </div>
          <input
            ref="importFile"
            data-testid="import-catalog-draft"
            type="file"
            accept=".json,application/json"
            hidden
            @change="importDraft"
          />
          <Button danger :disabled="!canEdit || !state.online" @click="confirmDiscard">{{
            t('discardDraft')
          }}</Button>
        </div>
      </Drawer>
    </template>
  </Page>
</template>
<style src="./developer.css"></style>

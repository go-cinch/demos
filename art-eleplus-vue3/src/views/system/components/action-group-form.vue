<script setup lang="ts">
  import type { GroupCatalog } from './action-groups'
  import type { ActionGroupDraft, PermissionGroupType } from './action-group-model'
  import { computed, onMounted, reactive, ref, useId, watch } from 'vue'
  import {
    Alert,
    Button,
    Form,
    FormItem,
    Input,
    Segmented,
    Spin,
    Switch,
    Tag,
    message
  } from '@/components/catalog/element-adapter'
  import { $t, refreshI18nCatalog } from '@/locales'
  import { catalogDefaultLocale, catalogGroupNames, catalogLanguages } from '@/locales/catalog'
  import { isValidActionGroup } from './action-config'
  import {
    ActionGroupCatalogError,
    changePermissionGroup,
    groupNames,
    savePermissionGroup
  } from './action-groups'

  const props = defineProps<{
    scope?: string
    existingWords?: string[]
    originalWord?: string
    document?: GroupCatalog
    draft?: ActionGroupDraft
    disabled?: boolean
    showActions?: boolean
  }>()
  const emit = defineEmits<{
    saved: [string, GroupCatalog?, PermissionGroupType?]
    cancel: []
    state: [{ loading: boolean; saving: boolean; ready: boolean }]
  }>()
  const formId = useId()
  const localModel = reactive<ActionGroupDraft>({
    word: props.originalWord ?? '',
    names: {},
    attempted: false
  })
  const model = computed(() => props.draft ?? localModel)
  const languages = computed(() => props.document?.locales ?? catalogLanguages())
  const defaultLocale = computed(() => props.document?.default_locale ?? catalogDefaultLocale())
  let initialNames: Record<string, string> = {}
  const loading = ref(true)
  const saving = ref(false)
  const failed = ref('')
  const duplicate = ref(false)
  const renaming = computed(
    () =>
      !!props.originalWord &&
      !!model.value.word.trim() &&
      model.value.word.trim() !== props.originalWord
  )
  const wordError = computed(() =>
    !model.value.attempted
      ? ''
      : !isValidActionGroup(
            model.value.word.trim(),
            props.originalWord?.split(':')[0] || props.scope
          )
        ? 'action-editor.invalidGroupWord'
        : duplicate.value ||
            (model.value.word.trim() !== props.originalWord &&
              props.existingWords?.includes(model.value.word.trim()))
          ? 'action-editor.groupExists'
          : ''
  )
  watch(
    () => ({ loading: loading.value, saving: saving.value, ready: languages.value.length > 0 }),
    (state) => emit('state', state),
    { immediate: true }
  )
  onMounted(async () => {
    if (!props.document) await refreshI18nCatalog()
    if (!languages.value.length) failed.value = 'groupCatalogUnavailable'
    initialNames = props.originalWord
      ? props.document
        ? groupNames(props.document, props.originalWord)
        : catalogGroupNames(props.originalWord)
      : {}
    // The workbench owns its persisted draft, including intentionally blank or
    // invalid input. Standalone dialogs continue to initialize from the catalog.
    if (!props.draft) model.value.names = { ...initialNames }
    loading.value = false
  })
  function missingName(tag: string) {
    return model.value.attempted && tag === defaultLocale.value && !model.value.names[tag]?.trim()
  }
  async function save() {
    if (props.disabled || saving.value || loading.value || !languages.value.length) return
    model.value.attempted = true
    failed.value = ''
    if (wordError.value || missingName(defaultLocale.value)) return
    saving.value = true
    try {
      const word = model.value.word.trim()
      const names = Object.fromEntries(
        languages.value
          .map((locale) => [locale.tag, model.value.names[locale.tag] ?? ''])
          .filter(([tag, value]) => !props.originalWord || value !== (initialNames[tag!] ?? ''))
      )
      let document: GroupCatalog | undefined
      if (props.document)
        document = changePermissionGroup(
          props.document,
          props.originalWord,
          word,
          names,
          model.value.isDefault ?? false
        )
      else await savePermissionGroup(word, names, props.originalWord)
      emit('saved', word, document, model.value.type ?? 0)
      message.success(
        $t(
          props.document
            ? 'action-editor.groupDraftUpdated'
            : props.originalWord
              ? 'action-editor.groupUpdated'
              : 'action-editor.groupCreated'
        )
      )
    } catch (error) {
      if (error instanceof ActionGroupCatalogError && error.reason === 'groupExists')
        duplicate.value = true
      else {
        failed.value =
          error instanceof ActionGroupCatalogError
            ? error.reason
            : props.originalWord
              ? 'groupUpdateFailed'
              : 'groupCreateFailed'
        if (failed.value === 'groupLanguagesChanged') await refreshI18nCatalog()
      }
    } finally {
      saving.value = false
    }
  }
  defineExpose({ save })
</script>

<template>
  <Spin :spinning="loading">
    <Form
      layout="vertical"
      :disabled="disabled || saving || loading"
      autocomplete="off"
      data-testid="permission-group-form"
      @submit.prevent="save"
    >
      <FormItem
        :label="$t('action-editor.groupWord')"
        :html-for="`${formId}-word`"
        required
        :validate-status="wordError ? 'error' : undefined"
        :help="wordError ? $t(wordError) : undefined"
      >
        <Input
          :id="`${formId}-word`"
          v-model:value="model.word"
          :aria-describedby="originalWord ? `${formId}-word-hint` : undefined"
          :maxlength="128"
          :placeholder="$t('action-editor.groupWordPlaceholder', { scope: scope || 'admin' })"
          @update:value="duplicate = false"
          @press-enter="save"
        />
        <template v-if="originalWord" #extra>
          <p :id="`${formId}-word-hint`" class="group-word-hint">{{
            $t('action-editor.groupWordHint')
          }}</p>
          <div v-if="renaming" class="group-word-change" role="status" aria-live="polite">
            <div class="group-word-transition"
              ><code>{{ originalWord }}</code
              ><span>→</span><code>{{ model.word.trim() }}</code></div
            >
            <p>{{
              $t(document ? 'action-editor.groupRenameDraftHint' : 'action-editor.groupRenameHint')
            }}</p>
          </div>
        </template>
      </FormItem>
      <FormItem
        v-if="document"
        :label="$t('action-editor.groupType')"
        :html-for="`${formId}-type`"
        :extra="$t('action-editor.groupTypePreviewHint')"
      >
        <Segmented
          class="group-type-options"
          :id="`${formId}-type`"
          :value="model.type ?? 0"
          :aria-label="$t('action-editor.groupType')"
          data-testid="permission-group-type"
          :options="[
            { value: 0, label: $t('action-editor.groupTypeNormal') },
            { value: 1, label: $t('action-editor.groupTypeDefault') },
            { value: 2, label: $t('action-editor.groupTypeRisk') }
          ]"
          @change="model.type = $event === 1 ? 1 : $event === 2 ? 2 : 0"
        />
      </FormItem>
      <FormItem
        v-if="document"
        :label="$t('action-editor.groupIsDefault')"
        :html-for="`${formId}-default`"
        :extra="$t('action-editor.groupDefaultHint')"
      >
        <Switch
          :id="`${formId}-default`"
          :checked="model.isDefault ?? false"
          :aria-label="$t('action-editor.groupIsDefault')"
          data-testid="permission-group-default"
          @update:checked="model.isDefault = !!$event"
        />
      </FormItem>
      <div class="names-heading">{{ $t('action-editor.groupNames') }}</div>
      <div class="group-names">
        <FormItem
          v-for="locale in languages"
          :key="locale.tag"
          :html-for="`${formId}-name-${locale.tag}`"
          :required="locale.tag === defaultLocale"
          :validate-status="missingName(locale.tag) ? 'error' : undefined"
          :help="missingName(locale.tag) ? $t('action-editor.groupNameRequired') : undefined"
        >
          <template #label>
            <span
              >{{ locale.name }} <span class="secondary">{{ locale.tag }}</span></span
            >
            <Tag v-if="locale.tag === defaultLocale" class="language-tag">{{
              $t('action-editor.defaultLanguage')
            }}</Tag>
            <Tag v-else-if="!locale.enabled" class="language-tag">{{
              $t('action-editor.disabledLanguage')
            }}</Tag>
          </template>
          <Input
            :id="`${formId}-name-${locale.tag}`"
            v-model:value="model.names[locale.tag]"
            :placeholder="$t('action-editor.groupNamePlaceholder')"
            @press-enter="save"
          />
        </FormItem>
      </div>
      <Alert
        v-if="failed"
        class="form-error"
        type="error"
        show-icon
        :message="$t(`action-editor.${failed}`)"
      />
      <div v-if="showActions" class="form-actions">
        <Button :disabled="saving" @click="emit('cancel')">{{ $t('system-editor.cancel') }}</Button>
        <Button
          type="primary"
          :loading="saving"
          :disabled="disabled || loading || !languages.length"
          @click="save"
          >{{ $t(originalWord ? 'system-editor.save' : 'system.common.create') }}</Button
        >
      </div>
    </Form>
  </Spin>
</template>

<style scoped>
  .group-type-options {
    width: fit-content;
    max-width: 100%;
  }
  .names-heading {
    margin-bottom: 12px;
    font-weight: 500;
  }
  .group-names {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 16px;
    max-height: 360px;
    overflow: auto;
    padding: 2px 2px 8px;
  }
  .group-names :deep(.el-form-item) {
    min-width: 0;
    margin-bottom: 0;
  }
  .group-names :deep(.el-form-item-label > label) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .secondary {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .language-tag {
    margin: 0;
    font-size: 11px;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 22px;
  }
  .form-error {
    margin-top: 14px;
  }
  .group-word-hint {
    margin: 0;
  }
  .group-word-change {
    margin-top: 10px;
    padding: 12px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    background: color-mix(in srgb, var(--el-fill-color-light) 50%, transparent);
  }
  .group-word-transition {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-primary);
  }
  .group-word-transition code {
    overflow-wrap: anywhere;
  }
  .group-word-change p {
    margin: 8px 0 0;
  }
  @media (max-width: 600px) {
    .group-names {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

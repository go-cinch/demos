<script setup lang="ts">
import type { MailLocale } from '#/api/mail-template';
import type { LoadFailure } from '#/api/request-error';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  FormItem,
  Input,
  Segmented,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { $t } from '#/locales';

import { emptyContent, previewDocument, renderSubject } from './content';
import MailTemplateDiff from './diff.vue';
import SourceEditor from './source-editor.vue';
import MailTestSend from './test-send.vue';
import { useMailTemplateDraft } from './use-mail-template-draft';
import VersionHistory from './version-history.vue';

const props = defineProps<{
  id: number;
  canEdit: boolean;
  canPublish: boolean;
  previousId?: number;
  nextId?: number;
  navigationLoading?: boolean;
  navigationError?: LoadFailure;
}>();
const emit = defineEmits<{
  close: [];
  navigate: [id: number];
  retryNavigation: [];
}>();
const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});
const diffOpen = ref(false);
const testSendOpen = ref(false);

const {
  record,
  loading,
  loadError,
  load,
  busy,
  dirty,
  saving,
  autoSaved,
  discarding,
  publishing,
  publicationError,
  hasPublicationChanges,
  publicationCheck,
  loadPublication,
  checkPublication,
  failure,
  templateIDError,
  titleError,
  sourceError,
  tab,
  locale,
  mode,
  selectedParameter,
  save,
  discardDraft,
  publish,
  restoreVersion,
  confirmLeave,
} = useMailTemplateDraft(props);
const historyOpened = ref(false);
const history = ref<InstanceType<typeof VersionHistory>>();
function showVersions() {
  historyOpened.value = true;
  if (tab.value === 'versions') void history.value?.refresh();
  else tab.value = 'versions';
}
const narrow = ref(false);
const translation = computed(
  () => record.value?.content[locale.value] ?? emptyContent()[locale.value],
);
const readonly = computed(() => !props.canEdit || busy.value);
const categoryOptions = computed(() =>
  ['verification', 'confirmation', 'security', 'notification'].map((value) => ({
    value,
    label: t(value),
  })),
);
const sourceOptions = computed(() => [
  { value: 'html', label: t('html') },
  { value: 'text', label: t('text') },
]);
const htmlPreview = computed(() =>
  previewDocument(translation.value, locale.value),
);
const subjectPreview = computed(() => renderSubject(translation.value));
function changeLanguage(value: unknown) {
  locale.value = value as MailLocale;
  titleError.value = '';
  sourceError.value = '';
  selectedParameter.value = '';
}
function changeMode(value: unknown) {
  mode.value = value as 'html' | 'text';
  sourceError.value = '';
}
async function closeEditor() {
  if (await confirmLeave()) emit('close');
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onMounted(() => {
  void load();
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
});
defineExpose({ confirmLeave });
</script>

<template>
  <section class="template-editor" :aria-busy="loading">
    <div class="editor-navigation">
      <Button type="link" class="back-button" @click="closeEditor">
        <IconifyIcon icon="lucide:arrow-left" />{{ t('back') }}
      </Button>
      <Space>
        <Button
          :disabled="!previousId || navigationLoading || loading || busy"
          @click="previousId && emit('navigate', previousId)"
        >
          <IconifyIcon icon="lucide:chevron-left" />{{ t('previous') }}
        </Button>
        <Button
          :disabled="!nextId || navigationLoading || loading || busy"
          @click="nextId && emit('navigate', nextId)"
        >
          {{ t('next') }}<IconifyIcon icon="lucide:chevron-right" />
        </Button>
      </Space>
    </div>
    <LoadWarning
      v-if="navigationError"
      :failure="navigationError"
      class="mb-4"
      :retry-label="t('retry')"
      retry-size="small"
      @retry="emit('retryNavigation')"
    />
    <!-- Share the loaded layout and control metrics during record navigation. -->
    <div v-if="loading" class="editor-skeleton" aria-hidden="true" inert>
      <div class="editor-heading">
        <div>
          <h1 class="skeleton-block skeleton-title">&nbsp;</h1>
          <div class="editor-meta">
            <span class="skeleton-block skeleton-meta">&nbsp;</span>
          </div>
        </div>
        <Space wrap>
          <Button v-if="canEdit" disabled>
            <IconifyIcon icon="lucide:send" />{{ t('testSend') }}
          </Button>
          <Button disabled>
            <IconifyIcon icon="lucide:git-compare-arrows" />{{ t('compare') }}
          </Button>
          <Button v-if="canEdit" disabled>{{ t('save') }}</Button>
          <Button v-if="canEdit" danger disabled>
            <IconifyIcon icon="lucide:undo-2" />{{ t('discardDraft') }}
          </Button>
          <Button v-if="canPublish" type="primary" disabled>
            {{ t('publish') }}
          </Button>
        </Space>
      </div>
      <div class="editor-tabs">
        <button class="active" disabled>{{ t('content') }}</button>
        <button disabled>{{ t('versions') }}</button>
      </div>
      <div class="editor-workspace">
        <section class="editor-panel">
          <div class="panel-heading">
            <strong>{{ t('content') }}</strong>
            <Segmented
              :value="locale"
              :options="[
                { label: '中文', value: 'zh-CN' },
                { label: 'English', value: 'en-US' },
              ]"
              disabled
            />
          </div>
          <div class="panel-content">
            <div class="metadata-fields">
              <FormItem class="aligned-field" :label="t('name')">
                <div class="skeleton-control"><Input disabled /></div>
              </FormItem>
              <FormItem class="category-field" :label="t('category')">
                <div class="skeleton-control"><Select disabled /></div>
              </FormItem>
            </div>
            <FormItem class="aligned-field" :label="t('templateID')">
              <div class="skeleton-control"><Input disabled /></div>
            </FormItem>
            <FormItem class="aligned-field" :label="t('subject')">
              <div class="skeleton-control"><Input disabled /></div>
            </FormItem>
            <Segmented :value="mode" :options="sourceOptions" disabled />
            <div class="source-region">
              <div class="source-label">
                <span
                  >{{ locale === 'zh-CN' ? '中文' : 'English' }} ·
                  {{ t(mode) }}</span
                >
                <Space v-if="canEdit" :size="8">
                  <Button size="small" disabled>{{ t('formatHTML') }}</Button>
                  <Button size="small" disabled>
                    {{ t('insertParameter') }}
                  </Button>
                </Space>
              </div>
              <div class="skeleton-control">
                <Input.TextArea class="source-input" :rows="20" disabled />
              </div>
            </div>
            <div class="parameter-tags">
              <span class="skeleton-block skeleton-parameter"></span>
            </div>
          </div>
        </section>
        <section class="editor-panel">
          <div class="panel-heading">
            <strong
              >{{ locale === 'zh-CN' ? '中文' : 'English' }} ·
              {{ t('preview') }}</strong
            >
            <Space>
              <Button size="small" type="primary" disabled>
                <IconifyIcon icon="lucide:monitor" />
              </Button>
              <Button size="small" disabled>
                <IconifyIcon icon="lucide:smartphone" />
              </Button>
            </Space>
          </div>
          <div class="preview-subject">
            {{ t('previewTitle') }}:
            <span class="skeleton-block skeleton-subject">&nbsp;</span>
          </div>
          <div class="preview-stage">
            <div class="skeleton-preview skeleton-block"></div>
          </div>
        </section>
      </div>
    </div>
    <LoadWarning
      v-else-if="loadError"
      :failure="loadError"
      :retry-label="t('retry')"
      @retry="load"
    />
    <template v-else-if="record">
      <LoadWarning
        v-if="publicationError"
        :failure="publicationError"
        class="mb-4"
        :retry-label="t('retry')"
        @retry="loadPublication"
      />
      <div class="editor-heading">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1>{{ record.name }}</h1>
            <Tag :color="dirty || record.has_draft ? 'orange' : 'green'">
              {{
                t(dirty ? 'dirty' : record.has_draft ? 'draft' : 'published')
              }} </Tag
            ><Tag v-if="!canEdit">{{ t('readonly') }}</Tag>
          </div>
          <div class="editor-meta">
            <span v-if="saving || autoSaved" role="status" aria-live="polite">{{
              t(saving ? 'savingDraft' : 'savedAutomatically')
            }}</span>
            <span>{{
              record.published_version
                ? t('liveVersion', { version: record.published_version })
                : t('unpublished')
            }}</span>
          </div>
        </div>
        <Space wrap>
          <Button v-if="canEdit" :disabled="busy" @click="testSendOpen = true">
            <IconifyIcon icon="lucide:send" />{{ t('testSend') }} </Button
          ><Button :disabled="busy" @click="diffOpen = true">
            <IconifyIcon icon="lucide:git-compare-arrows" />{{
              t('compare')
            }} </Button
          ><Button
            v-if="canEdit"
            :loading="saving"
            :disabled="busy || !!publicationCheck || !dirty"
            @click="save()"
          >
            {{ t('save') }} </Button
          ><Button
            v-if="canEdit"
            danger
            :loading="discarding"
            :disabled="
              busy ||
              !!publicationCheck ||
              !record.published_version ||
              !hasPublicationChanges
            "
            :title="
              !record.published_version
                ? t('discardDraftUnavailable')
                : undefined
            "
            @click="discardDraft"
          >
            <IconifyIcon icon="lucide:undo-2" />{{ t('discardDraft') }} </Button
          ><Button
            v-if="canPublish"
            type="primary"
            :loading="publishing"
            :disabled="
              busy ||
              saving ||
              !!publicationCheck ||
              !hasPublicationChanges ||
              (dirty && !canEdit)
            "
            @click="publish"
          >
            {{ t('publish') }}
          </Button>
        </Space>
      </div>
      <Alert
        v-if="publicationCheck"
        type="warning"
        class="mb-4"
        :message="
          t(
            publicationCheck === 'checking'
              ? 'publicationChecking'
              : 'publicationUnknown',
          )
        "
      >
        <template v-if="publicationCheck === 'unknown'" #action>
          <Button @click="checkPublication">
            {{ t('publicationRecheck') }}
          </Button>
        </template>
      </Alert>
      <Alert
        v-if="failure"
        type="error"
        :message="failure"
        class="mb-4"
        closable
        @close="failure = ''"
      />
      <MailTestSend
        v-if="testSendOpen"
        :id="record.id"
        :locale="locale"
        :content="record.content"
        @close="testSendOpen = false"
        @sending="busy = $event"
      />
      <div class="editor-tabs">
        <button :class="{ active: tab === 'content' }" @click="tab = 'content'">
          {{ t('content') }}</button
        ><button :class="{ active: tab === 'versions' }" @click="showVersions">
          {{ t('versions') }}
        </button>
      </div>
      <div v-if="tab === 'content'" class="editor-workspace">
        <section class="editor-panel">
          <div class="panel-heading">
            <strong>{{ t('content') }}</strong
            ><Segmented
              :value="locale"
              :options="[
                { label: '中文', value: 'zh-CN' },
                { label: 'English', value: 'en-US' },
              ]"
              @change="changeLanguage"
            />
          </div>
          <div class="panel-content">
            <div class="metadata-fields">
              <FormItem class="aligned-field" :label="t('name')">
                <Input
                  v-model:value="record.name"
                  :aria-label="t('name')"
                  :disabled="readonly"
                  :maxlength="100"
                /> </FormItem
              ><FormItem class="category-field" :label="t('category')">
                <Select
                  v-model:value="record.category"
                  :aria-label="t('category')"
                  :options="categoryOptions"
                  :disabled="readonly"
                />
              </FormItem>
            </div>
            <FormItem
              class="aligned-field"
              :label="t('templateID')"
              :validate-status="templateIDError ? 'error' : undefined"
              :help="templateIDError ? t(templateIDError) : undefined"
            >
              <Input
                v-model:value="record.template_id"
                :aria-label="t('templateID')"
                :disabled="readonly"
                :maxlength="100"
                @input="templateIDError = ''"
              />
            </FormItem>
            <FormItem
              class="aligned-field"
              :label="t('subject')"
              :validate-status="titleError ? 'error' : undefined"
              :help="titleError ? t(titleError) : undefined"
            >
              <Input
                v-model:value="translation.subject"
                :aria-label="t('subject')"
                :disabled="readonly"
                :maxlength="500"
                @input="titleError = ''"
              />
            </FormItem>
            <Segmented
              :value="mode"
              :options="sourceOptions"
              @change="changeMode"
            />
            <SourceEditor
              :record="record"
              :can-edit="canEdit"
              :busy="busy"
              :locale="locale"
              :mode="mode"
              v-model:error="sourceError"
              v-model:selected="selectedParameter"
            />
          </div>
        </section>
        <section class="editor-panel">
          <div class="panel-heading">
            <strong
              >{{ locale === 'zh-CN' ? '中文' : 'English' }} ·
              {{ t('preview') }}</strong
            ><Space>
              <Button
                size="small"
                :type="!narrow ? 'primary' : 'default'"
                :aria-label="t('desktop')"
                @click="narrow = false"
              >
                <IconifyIcon icon="lucide:monitor" /> </Button
              ><Button
                size="small"
                :type="narrow ? 'primary' : 'default'"
                :aria-label="t('narrow')"
                @click="narrow = true"
              >
                <IconifyIcon icon="lucide:smartphone" />
              </Button>
            </Space>
          </div>
          <div class="preview-subject">
            {{ t('previewTitle') }}: {{ subjectPreview }}
          </div>
          <div class="preview-stage">
            <iframe
              :title="t('preview')"
              :srcdoc="htmlPreview"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerpolicy="no-referrer"
              :class="{ narrow }"
            ></iframe>
          </div>
        </section>
      </div>
      <VersionHistory
        v-if="historyOpened"
        :active="tab === 'versions'"
        ref="history"
        :id="id"
        :published-version="record.published_version"
        :can-edit="canEdit"
        :locale="locale"
        :restore-disabled="busy || saving || dirty || !!publicationCheck"
        @language="changeLanguage"
        @restore="restoreVersion"
      />
    </template>
    <MailTemplateDiff
      v-if="diffOpen && record"
      :draft="record"
      :unsaved="dirty"
      @close="diffOpen = false"
    />
  </section>
</template>

<style scoped>
.template-editor {
  min-width: 0;
}

.back-button {
  padding-left: 0;
  margin-bottom: 14px;
}

.editor-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.editor-heading > :first-child {
  flex: 1;
  min-width: min(100%, 320px);
}

.editor-heading h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.editor-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.editor-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.editor-tabs button {
  padding: 0 0 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.editor-tabs button.active {
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.editor-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

:deep(.editor-panel) {
  min-width: 0;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.panel-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.panel-content {
  padding: 16px;
}

.editor-navigation {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.aligned-field :deep(.ant-form-item-label) {
  flex: 0 0 116px;
}

.aligned-field :deep(.ant-form-item-control) {
  flex: 1;
  min-width: 0;
}

.category-field :deep(.ant-form-item-row) {
  flex-wrap: nowrap;
}

.category-field :deep(.ant-form-item-label) {
  flex: 0 0 auto;
  width: auto;
}

.category-field :deep(.ant-form-item-control) {
  flex: 1;
  min-width: 0;
}

.category-field :deep(.ant-select) {
  width: 100%;
}

.metadata-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: 12px;
}

.preview-subject {
  padding: 14px 16px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.preview-stage {
  padding: 16px;
  background: hsl(var(--muted) / 40%);
}

.preview-stage iframe,
.preview-stage .skeleton-preview {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 650px;
  margin: auto;
  background: hsl(var(--card));
  border: 0;
  border-radius: var(--radius);
}

.preview-stage iframe.narrow {
  max-width: 320px;
}

.skeleton-title {
  width: 240px;
  max-width: 100%;
}

.skeleton-parameter {
  width: 160px;
  height: 32px;
}

.skeleton-meta {
  width: 100px;
}

.skeleton-subject {
  display: inline-block;
  width: 45%;
  vertical-align: bottom;
}

.skeleton-control {
  position: relative;
}

.skeleton-control > * {
  visibility: hidden;
}

.skeleton-control::after {
  position: absolute;
  inset: 0;
  content: '';
}

.skeleton-block,
.skeleton-control::after,
.preview-stage .skeleton-preview {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 16%) 37%,
    hsl(var(--muted)) 63%
  );
  background-size: 400% 100%;
  border-radius: var(--radius);
  animation: editor-skeleton-pulse 1.4s ease infinite;
}

@keyframes editor-skeleton-pulse {
  from {
    background-position: 100% 50%;
  }

  to {
    background-position: 0 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-block,
  .skeleton-control::after,
  .preview-stage .skeleton-preview {
    animation: none;
  }
}

@media (max-width: 1050px) {
  .editor-workspace {
    grid-template-columns: 1fr;
  }

  .preview-stage iframe,
  .preview-stage .skeleton-preview {
    max-width: 580px;
  }
}

@media (max-width: 600px) {
  .metadata-fields {
    grid-template-columns: 1fr;
  }

  .category-field :deep(.ant-form-item-label) {
    flex-basis: 116px;
  }

  .panel-content {
    padding: 12px;
  }
}
</style>

<style scoped src="./source-layout.css"></style>

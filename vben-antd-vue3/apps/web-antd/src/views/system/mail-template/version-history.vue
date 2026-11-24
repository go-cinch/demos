<script setup lang="ts">
import type { MailLocale, MailVersion } from '#/api/mail-template';
import type { LoadFailure } from '#/api/request-error';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Empty, Modal, Segmented, Space, Tag } from 'ant-design-vue';

import { getMailVersion, listMailVersions } from '#/api/mail-template';
import { loadFailure } from '#/api/request-error';
import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import { previewDocument } from './content';

const props = defineProps<{
  active: boolean;
  id: number;
  publishedVersion: number;
  canEdit: boolean;
  restoreDisabled: boolean;
  locale: MailLocale;
}>();
const emit = defineEmits<{
  restore: [version: number];
  language: [value: unknown];
}>();
const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});
let alive = true;
const timezone = useTimezoneStore();
const date = (value: number) => {
  void timezone.timezone;
  return formatDateTime(value);
};
const versions = ref<Omit<MailVersion, 'content'>[]>();
const versionRows = computed(() => {
  if (versions.value) return versions.value;
  const latest = props.publishedVersion;
  const count = Math.min(3, Math.max(1, latest));
  return Array.from({ length: count }, (_, index) => ({
    version: latest - index,
    created_at: null,
  }));
});
const versionsLoading = ref(false);
const versionsError = ref<LoadFailure>(false);
const versionOpen = ref(false);
const versionPreview = ref<MailVersion>();
let historyRequest = 0;
function isCurrentHistoryRequest(request: number) {
  return alive && props.active && request === historyRequest;
}
async function showVersions() {
  const request = ++historyRequest;
  versionsLoading.value = true;
  versionsError.value = false;
  try {
    const items = await listMailVersions(props.id);
    if (isCurrentHistoryRequest(request)) versions.value = items;
  } catch (requestError) {
    if (isCurrentHistoryRequest(request))
      versionsError.value = loadFailure(requestError);
  } finally {
    if (isCurrentHistoryRequest(request)) versionsLoading.value = false;
  }
}
async function viewVersion(version: number) {
  const request = ++historyRequest;
  try {
    const preview = await getMailVersion(props.id, version);
    if (!isCurrentHistoryRequest(request)) return;
    versionPreview.value = preview;
    versionOpen.value = true;
  } catch (requestError) {
    if (isCurrentHistoryRequest(request))
      versionsError.value = loadFailure(requestError);
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) void showVersions();
    else {
      historyRequest++;
      versionOpen.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
});
defineExpose({ refresh: showVersions });
</script>

<template>
  <section v-if="active" class="editor-panel" :aria-busy="versionsLoading">
    <LoadWarning
      v-if="versionsError"
      :failure="versionsError"
      :retry-label="t('retry')"
      @retry="showVersions"
    />
    <Empty v-else-if="!versionRows.length" :description="t('noVersions')" />
    <div
      v-for="item in versionRows"
      v-else
      :key="item.version"
      class="version-row"
    >
      <div
        v-skeleton="{ loading: versionsLoading, targets: 'strong,.ant-tag,p' }"
        :aria-hidden="versionsLoading || undefined"
      >
        <Space>
          <strong>v{{ item.version }}</strong>
          <Tag
            v-if="publishedVersion && item.version === publishedVersion"
            color="green"
          >
            {{ t('current') }}
          </Tag>
        </Space>
        <p>
          {{
            item.created_at === null
              ? '0000-00-00 00:00:00'
              : date(item.created_at)
          }}
        </p>
      </div>
      <Space>
        <Button :disabled="versionsLoading" @click="viewVersion(item.version)">
          {{ t('view') }}
        </Button>
        <Button
          v-if="canEdit"
          :disabled="versionsLoading || restoreDisabled"
          @click="emit('restore', item.version)"
        >
          {{ t('restore') }}
        </Button>
      </Space>
    </div>
  </section>
  <Modal
    v-model:open="versionOpen"
    :title="versionPreview ? `v${versionPreview.version}` : ''"
    :footer="null"
    width="800px"
  >
    <template v-if="versionPreview">
      <Segmented
        :value="locale"
        :options="[
          { label: '中文', value: 'zh-CN' },
          { label: 'English', value: 'en-US' },
        ]"
        @change="emit('language', $event)"
      />
      <p class="my-4">{{ versionPreview.content[locale].subject }}</p>
      <iframe
        class="version-preview"
        :title="t('preview')"
        :srcdoc="previewDocument(versionPreview.content[locale], locale)"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
      ></iframe>
    </template>
  </Modal>
</template>

<style scoped>
.version-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.version-row p {
  margin: 7px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.version-preview {
  width: 100%;
  height: 560px;
  border: 0;
}
</style>

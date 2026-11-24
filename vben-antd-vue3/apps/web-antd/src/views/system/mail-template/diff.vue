<script setup lang="ts">
import type { MailTemplate, MailVersion } from '#/api/mail-template';
import type { LoadFailure } from '#/api/request-error';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { Alert, Button, Empty, Modal, Switch, Tag } from 'ant-design-vue';

import { getMailTemplate, getMailVersion } from '#/api/mail-template';
import { loadFailure } from '#/api/request-error';
import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import { templateDifferences } from './comparison';
import DiffCode from './diff-code.vue';
import { compareCharacters } from './inline-comparison';

const props = defineProps<{ draft: MailTemplate; unsaved: boolean }>();
const emit = defineEmits<{ close: [] }>();
const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});
const compact = ref(true);
const failed = ref<LoadFailure>(false);
const loading = ref(true);
const showUnchanged = ref(true);
// undefined while the first read is pending, null for a confirmed unpublished draft.
const published = ref<MailVersion | null>();
const baselineVersion = computed(() =>
  published.value === undefined
    ? props.draft.published_version
    : (published.value?.version ?? 0),
);
const expanded = ref(new Set<string>());
const activeChange = ref(-1);
const comparisonBody = ref<HTMLElement>();
const stickyHeader = ref<HTMLElement>();
const comparison = computed(() => {
  if (published.value === undefined) return { fields: [], count: 0 };
  let count = 0;
  const fields = templateDifferences(
    props.draft,
    published.value ?? undefined,
  ).map((field) => ({
    ...field,
    rows: field.rows.map((row, index) => {
      const segments = compareCharacters(
        displayedLine(field.key, row.before?.text ?? ''),
        displayedLine(field.key, row.after?.text ?? ''),
      );
      const indices = new Map<number, number>();
      const changedIds = [
        ...new Set(
          [...segments.before, ...segments.after]
            .filter((part) => part.changed)
            .map((part) => part.id),
        ),
      ].toSorted((a, b) => a - b);
      for (const id of changedIds) indices.set(id, count++);
      for (const part of [...segments.before, ...segments.after])
        part.changeIndex = indices.get(part.id);
      return {
        ...row,
        id: `${field.key}:${index}`,
        segments,
        blankChangeIndex:
          row.changed && changedIds.length === 0 ? count++ : undefined,
      };
    }),
  }));
  return { fields, count };
});
const differences = computed(() => comparison.value.fields);
watch(
  comparison,
  () => {
    expanded.value.clear();
    activeChange.value = comparison.value.count ? 0 : -1;
  },
  { immediate: true },
);
async function navigateChange(direction: number) {
  const count = comparison.value.count;
  if (!count) return;
  activeChange.value = (activeChange.value + direction + count) % count;
  await nextTick();
  const body = comparisonBody.value;
  const target =
    body?.querySelector<HTMLElement>(
      `.added [data-change-index="${activeChange.value}"]`,
    ) ??
    body?.querySelector<HTMLElement>(
      `[data-change-index="${activeChange.value}"]`,
    );
  if (!body || !target) return;
  const headerHeight = stickyHeader.value?.offsetHeight ?? 0;
  body.scrollTo({
    top:
      body.scrollTop +
      target.getBoundingClientRect().top -
      body.getBoundingClientRect().top -
      headerHeight -
      Math.max(24, (body.clientHeight - headerHeight) / 3),
    behavior: 'instant',
  });
}
let request = 0;
async function load() {
  const sequence = ++request;
  loading.value = true;
  failed.value = false;
  try {
    // Read only the latest publication pointer; never replace local draft edits.
    const latest = await getMailTemplate(props.draft.id);
    if (sequence !== request) return;
    const snapshot = latest.published_version
      ? await getMailVersion(props.draft.id, latest.published_version)
      : null;
    if (sequence !== request) return;
    // Published versions are immutable. Keep expanded lines and the current
    // change when refreshing the same baseline.
    if (
      published.value === undefined ||
      published.value?.version !== snapshot?.version
    ) {
      published.value = snapshot;
    }
  } catch (requestError) {
    if (sequence === request) failed.value = loadFailure(requestError);
  } finally {
    if (sequence === request) loading.value = false;
  }
}
function displayedLine(key: string, text: string) {
  return key === 'category' && text ? t(text) : text;
}
onMounted(load);
onBeforeUnmount(() => {
  request++;
});
</script>

<template>
  <Modal
    :open="true"
    :title="t('compare')"
    :footer="null"
    width="1200px"
    :style="{ maxWidth: 'calc(100vw - 32px)', top: '32px' }"
    @cancel="emit('close')"
  >
    <div ref="comparisonBody" class="comparison-body" :aria-busy="loading">
      <LoadWarning
        v-if="failed"
        :failure="failed"
        :retry-label="t('retry')"
        @retry="load"
      />
      <template v-else>
        <div ref="stickyHeader" class="comparison-sticky">
          <div class="comparison-toolbar">
            <div class="comparison-navigation">
              <Button
                class="previous-change"
                :disabled="loading || comparison.count === 0"
                :aria-label="t('previousChange')"
                :title="t('previousChange')"
                @click="navigateChange(-1)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="m5 12 7-7 7 7M12 5v14" />
                </svg>
              </Button>
              <Button
                class="next-change"
                :disabled="loading || comparison.count === 0"
                :aria-label="t('nextChange')"
                :title="t('nextChange')"
                @click="navigateChange(1)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="m5 12 7 7 7-7M12 5v14" />
                </svg>
              </Button>
              <span
                v-skeleton="loading"
                class="change-position"
                role="status"
                aria-live="polite"
                >{{
                  t('changePosition', {
                    current: activeChange + 1,
                    total: comparison.count,
                  })
                }}</span
              >
              <span v-skeleton="loading">{{
                t('changedFields', { count: differences.length })
              }}</span>
            </div>
            <div class="comparison-actions">
              <label for="mail-diff-compact">{{
                t('foldUnchangedContent')
              }}</label>
              <Switch
                id="mail-diff-compact"
                v-model:checked="compact"
                :aria-label="t('foldUnchangedContent')"
              />
              <label for="mail-diff-unchanged">{{
                t('showUnchangedLines')
              }}</label>
              <Switch
                id="mail-diff-unchanged"
                v-model:checked="showUnchanged"
                :aria-label="t('showUnchangedLines')"
              />
              <Button size="small" :disabled="loading" @click="load">{{
                t('refreshDiff')
              }}</Button>
            </div>
          </div>
          <Alert
            v-if="!baselineVersion"
            v-skeleton="published === undefined"
            type="info"
            :message="t('diffFirstPublish')"
            class="mb-4"
          />
          <div class="comparison-head">
            <strong>{{
              baselineVersion
                ? t('publishedBaseline', { version: baselineVersion })
                : t('noPublishedVersion')
            }}</strong>
            <strong
              >{{ t('currentDraft') }}
              <Tag v-if="unsaved" color="orange">{{ t('dirty') }}</Tag></strong
            >
          </div>
        </div>
        <section
          v-if="published === undefined"
          v-skeleton="{
            loading: true,
            targets: '.skeleton-field-name,.line-number,code',
          }"
          class="comparison-field"
          aria-hidden="true"
        >
          <h3><span class="skeleton-field-name">&nbsp;</span></h3>
          <div v-for="row in 3" :key="row" class="comparison-row">
            <div v-for="side in 2" :key="side" class="comparison-cell">
              <span class="line-number">&nbsp;</span>
              <span class="line-sign"></span>
              <code class="skeleton-code">&nbsp;</code>
            </div>
          </div>
        </section>
        <Empty
          v-else-if="differences.length === 0"
          :description="t('noContentDifferences')"
          class="my-8"
        />
        <section
          v-for="field in differences"
          :key="field.key"
          class="comparison-field"
          :aria-label="`${field.locale ? `${field.locale === 'zh-CN' ? '中文' : 'English'} · ` : ''}${t(field.label)}`"
        >
          <h3>
            {{
              field.locale
                ? `${field.locale === 'zh-CN' ? '中文' : 'English'} · `
                : ''
            }}{{ t(field.label) }}
          </h3>
          <div
            v-for="row in field.rows.filter(
              (item) => showUnchanged || item.changed,
            )"
            :key="row.id"
            class="comparison-row"
            :data-change-index="row.blankChangeIndex"
            :class="{
              'active-empty-row': row.blankChangeIndex === activeChange,
            }"
          >
            <div
              class="comparison-cell"
              :class="{
                removed: row.changed && row.before,
                blank: !row.before,
              }"
            >
              <span class="line-number" aria-hidden="true">{{
                row.before?.number
              }}</span>
              <span
                class="line-sign"
                :aria-label="
                  row.changed && row.before ? t('removedLine') : undefined
                "
                >{{ row.changed && row.before ? '−' : '' }}</span
              >
              <DiffCode
                :segments="row.segments.before"
                :compact="compact"
                :row-id="row.id"
                :expanded="expanded"
                :active-change="activeChange"
                @expand="expanded.add($event)"
                side="before"
              />
            </div>
            <div
              class="comparison-cell"
              :class="{ added: row.changed && row.after, blank: !row.after }"
            >
              <span class="line-number" aria-hidden="true">{{
                row.after?.number
              }}</span>
              <span
                class="line-sign"
                :aria-label="
                  row.changed && row.after ? t('addedLine') : undefined
                "
                >{{ row.changed && row.after ? '+' : '' }}</span
              >
              <DiffCode
                :segments="row.segments.after"
                :compact="compact"
                :row-id="row.id"
                :expanded="expanded"
                :active-change="activeChange"
                @expand="expanded.add($event)"
                side="after"
              />
            </div>
          </div>
        </section>
        <p class="comparison-note">{{ t('diffIdExcluded') }}</p>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.comparison-body {
  max-height: calc(100vh - 160px);
  overflow: auto;
}

.comparison-toolbar,
.comparison-actions,
.comparison-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.comparison-toolbar {
  justify-content: space-between;
  padding: 12px 0;
}

.comparison-head,
.comparison-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.comparison-sticky {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-bottom: 8px;
  background: hsl(var(--card));
}

.comparison-head {
  border: 1px solid hsl(var(--border));
}

.comparison-navigation .ant-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  padding: 0;
}

.change-position {
  min-width: 96px;
  font-variant-numeric: tabular-nums;
}

.comparison-head > strong {
  padding: 12px;
}

.comparison-field {
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.comparison-field h3 {
  padding: 10px 12px;
  margin: 0;
  font-weight: 600;
  background: hsl(var(--muted));
}

.comparison-cell {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  min-width: 0;
  padding: 5px 8px;
  border-top: 1px solid hsl(var(--border) / 40%);
}

.comparison-cell + .comparison-cell,
.comparison-head > strong + strong {
  border-left: 1px solid hsl(var(--border));
}

.skeleton-field-name {
  display: inline-block;
  width: 9em;
}

.skeleton-code {
  width: 65%;
  font: 12px/1.7 monospace;
}

.line-number {
  min-width: 24px;
  font: 12px/1.7 monospace;
  color: hsl(var(--muted-foreground));
  text-align: right;
}

.line-sign {
  flex-shrink: 0;
  width: 10px;
  font: 12px/1.7 monospace;
}

.removed {
  background: rgb(239 68 68 / 10%);
}

.added {
  background: rgb(34 197 94 / 10%);
}

.removed .line-sign {
  color: #dc2626;
}

.added .line-sign {
  color: #15803d;
}

.blank {
  background: hsl(var(--muted) / 50%);
}

.active-empty-row {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.comparison-note {
  margin: 16px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>

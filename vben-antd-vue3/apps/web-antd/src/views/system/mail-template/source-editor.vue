<script setup lang="ts">
import type { MailLocale, MailTemplate } from '#/api/mail-template';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  toRefs,
  watch,
} from 'vue';

import { Button, Input, Space } from 'ant-design-vue';

import { $t } from '#/locales';

import {
  correspondingRange,
  mailLocales,
  parameterMatches,
  parameterNamePattern,
  parameterNames,
} from './content';
import { formatMailHTML } from './format-html';
import ParameterDialog from './parameter-dialog.vue';

const props = defineProps<{
  canEdit: boolean;
  busy: boolean;
  record: MailTemplate;
  locale: MailLocale;
  mode: 'html' | 'text';
}>();
const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});
const sourceError = defineModel<string>('error', { required: true });
const selectedParameter = defineModel<string>('selected', { required: true });
const readonly = computed(() => !props.canEdit || props.busy);
const { record, locale, mode } = toRefs(props);
const translation = computed(() => record.value.content[locale.value]);
const formattingHTML = ref(false);
const tags = computed(() =>
  parameterNames(translation.value.html).map((name) => ({
    name,
    value: translation.value.preview_values?.[name],
  })),
);
const sourceRegion = ref<HTMLElement>();
const textarea = () => sourceRegion.value?.querySelector('textarea');
const locating = ref(false);
const occurrences = new Map<string, number>();
let alive = true;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let promptTimer: ReturnType<typeof setTimeout> | undefined;
function updateSource(value: string) {
  translation.value[mode.value] = value;
  sourceError.value = '';
}
async function formatHTML() {
  if (
    readonly.value ||
    formattingHTML.value ||
    mode.value !== 'html' ||
    !record.value
  )
    return;
  const id = record.value.id;
  const language = locale.value;
  const source = record.value.content[language].html;
  if (!source.trim()) return;
  const isCurrent = () =>
    alive &&
    !readonly.value &&
    record.value?.id === id &&
    locale.value === language &&
    mode.value === 'html' &&
    record.value.content[language].html === source;
  formattingHTML.value = true;
  clearTimeout(promptTimer);
  sourceError.value = '';
  try {
    const formatted = await formatMailHTML(source);
    // The formatter loads asynchronously. Never overwrite newer edits or another language.
    if (!isCurrent()) return;
    updateSource(formatted);
    clearTimeout(highlightTimer);
    selectedParameter.value = '';
    locating.value = false;
    occurrences.clear();
    await nextTick();
    if (!alive || locale.value !== language || mode.value !== 'html') return;
    const element = textarea();
    element?.focus({ preventScroll: true });
    element?.setSelectionRange(0, 0);
    if (element) {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    }
  } catch {
    if (isCurrent()) sourceError.value = 'formatFailed';
  } finally {
    formattingHTML.value = false;
  }
}
async function selectRange(start: number, end: number, name: string) {
  await nextTick();
  const element = textarea();
  if (!element) return;
  element.focus({ preventScroll: true });
  element.setSelectionRange(start, end);
  element.scrollIntoView({
    block: 'nearest',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  });
  const line = element.value.slice(0, start).split('\n').length - 1;
  const style = getComputedStyle(element);
  element.scrollTop = Math.max(
    0,
    line * (Number.parseFloat(style.lineHeight) || 21) -
      element.clientHeight / 2,
  );
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (context) {
    context.font = style.font;
    const prefix = element.value.slice(
      element.value.lastIndexOf('\n', start - 1) + 1,
      start,
    );
    element.scrollLeft = Math.max(
      0,
      context.measureText(prefix).width - element.clientWidth / 2,
    );
  }
  selectedParameter.value = name;
  locating.value = false;
  await nextTick();
  locating.value = true;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    locating.value = false;
  }, 900);
}
const parameterEditing = ref(false);
const parameterOpen = ref(false);
const parameterForm = reactive({ name: '', 'zh-CN': '', 'en-US': '' });
const parameterError = ref('');
let insertion = { start: 0, end: 0, locale: 'zh-CN' as MailLocale };
function insertParameter() {
  const element = textarea();
  if (!element || readonly.value) return;
  insertion = {
    start: element.selectionStart,
    end: element.selectionEnd,
    locale: locale.value,
  };
  parameterEditing.value = false;
  Object.assign(parameterForm, { name: '', 'zh-CN': '', 'en-US': '' });
  parameterError.value = '';
  parameterOpen.value = true;
}
function existingPreview(value: string) {
  parameterForm.name = value;
  for (const language of mailLocales)
    parameterForm[language] =
      record.value?.content[language].preview_values[value.trim()] ?? '';
  parameterError.value = '';
}
async function locate(name: string) {
  clearTimeout(promptTimer);
  const matches = parameterMatches(translation.value.html).filter(
    (match) => match.name === name,
  );
  if (matches.length === 0) return;
  const key = `${locale.value}:${name}`;
  const index = (occurrences.get(key) ?? 0) % matches.length;
  occurrences.set(key, index + 1);
  const match = matches[index];
  if (!match) return;
  insertion = { start: match.start, end: match.end, locale: locale.value };
  await selectRange(match.start, match.end, name);
  if (translation.value.preview_values[name] === undefined && !readonly.value) {
    const activeLocale = locale.value;
    promptTimer = setTimeout(() => {
      if (locale.value !== activeLocale || !alive || mode.value !== 'html')
        return;
      parameterEditing.value = true;
      existingPreview(name);
      parameterError.value = '';
      parameterOpen.value = true;
    }, 200);
  }
}
async function confirmParameter() {
  const name = parameterForm.name.trim();
  if (!parameterNamePattern.test(name)) {
    parameterError.value = 'parameterNameInvalid';
    return;
  }
  if (mailLocales.some((language) => !parameterForm[language].trim())) {
    parameterError.value = 'previewValueRequired';
    return;
  }
  if (!record.value) return;
  const value = record.value.content[insertion.locale];
  const otherLocale = insertion.locale === 'zh-CN' ? 'en-US' : 'zh-CN';
  const other = record.value.content[otherLocale];
  let end = insertion.end;
  if (!parameterEditing.value) {
    const range = correspondingRange(
      value.html,
      other.html,
      insertion.start,
      insertion.end,
      parameterForm[insertion.locale],
      parameterForm[otherLocale],
    );
    if (!range) {
      parameterError.value = 'parameterPositionMismatch';
      return;
    }
    const token = `{{${name}}}`;
    value.html =
      value.html.slice(0, insertion.start) +
      token +
      value.html.slice(insertion.end);
    other.html =
      other.html.slice(0, range.start) + token + other.html.slice(range.end);
    end = insertion.start + token.length;
  }
  for (const language of mailLocales)
    record.value.content[language].preview_values[name] =
      parameterForm[language];
  parameterOpen.value = false;
  await selectRange(insertion.start, end, name);
}

watch([locale, mode], () => clearTimeout(promptTimer), { flush: 'sync' });
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(highlightTimer);
  clearTimeout(promptTimer);
});
</script>

<template>
  <div ref="sourceRegion" class="source-region">
    <div class="source-label">
      <label for="mail-template-source"
        >{{ locale === 'zh-CN' ? '中文' : 'English' }} · {{ t(mode) }}</label
      >
      <Space v-if="canEdit && mode === 'html'" :size="8">
        <Button
          :disabled="readonly || !translation.html.trim()"
          :loading="formattingHTML"
          size="small"
          @click="formatHTML"
        >
          {{ t('formatHTML') }}
        </Button>
        <Button :disabled="busy" size="small" @click="insertParameter">
          {{ t('insertParameter') }}
        </Button>
      </Space>
    </div>
    <Input.TextArea
      id="mail-template-source"
      :value="translation[mode]"
      :aria-label="t(mode)"
      :readonly="readonly"
      :status="sourceError ? 'error' : undefined"
      class="source-input"
      :class="{ locating }"
      :rows="20"
      :spellcheck="false"
      @update:value="updateSource"
    />
    <div v-if="sourceError" class="field-error" role="alert">
      {{ t(sourceError) }}
    </div>
  </div>
  <div v-if="mode === 'html'" class="parameter-tags">
    <button
      v-for="item in tags"
      :key="item.name"
      class="parameter-tag"
      :class="{ selected: selectedParameter === item.name }"
      :aria-label="t('locate', { name: item.name })"
      @click="locate(item.name)"
    >
      <code>{{ item.name }}</code
      ><span>·</span
      ><span class="sample">{{ item.value ?? t('missingPreview') }}</span>
    </button>
  </div>
  <ParameterDialog
    v-model:open="parameterOpen"
    :editing="parameterEditing"
    :form="parameterForm"
    :error="parameterError"
    @name="existingPreview"
    @sample="(language, value) => (parameterForm[language] = value)"
    @confirm="confirmParameter"
  />
</template>

<style scoped>
.parameter-tag {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  max-width: 100%;
  padding: 5px 9px;
  font-size: 12px;
  color: hsl(var(--primary));
  cursor: pointer;
  background: transparent;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.625);
}

.parameter-tag.selected {
  background: hsl(var(--primary) / 8%);
  border-color: hsl(var(--primary));
}

.parameter-tag .sample {
  max-width: 165px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.field-error {
  margin-top: 5px;
  font-size: 12px;
  color: #ef4444;
}

.source-input.locating {
  animation: parameter-location 0.9s ease-out;
}

@keyframes parameter-location {
  0%,
  45% {
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 4px hsl(var(--primary) / 20%);
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .source-input.locating {
    border-color: hsl(var(--primary));
    animation: none;
  }
}
</style>

<style scoped src="./source-layout.css"></style>

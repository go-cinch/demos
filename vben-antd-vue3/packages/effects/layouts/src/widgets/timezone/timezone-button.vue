<script setup lang="ts">
import type { TimezoneChoice } from '@vben/preferences';

import { computed, onUnmounted, ref, useId } from 'vue';

import { createIconifyIcon } from '@vben/icons';
import { $t, i18n } from '@vben/locales';
import {
  formatTimezoneOffset,
  formatTimezoneTime,
  timezoneName,
} from '@vben/preferences';
import { useTimezoneStore } from '@vben/stores';

import { useVbenModal } from '@vben-core/popup-ui';
import {
  Input,
  RadioGroup,
  RadioGroupItem,
  VbenIconButton,
} from '@vben-core/shadcn-ui';

withDefaults(defineProps<{ showButton?: boolean; settingsEntry?: boolean }>(), {
  showButton: true,
  settingsEntry: false,
});

const TimezoneIcon = createIconifyIcon('lucide:globe-2');
const SearchIcon = createIconifyIcon('lucide:search');
const ChevronIcon = createIconifyIcon('lucide:chevron-right');
const timezoneStore = useTimezoneStore();
const id = useId();
const selected = ref('');
const query = ref('');
const region = ref('All');
const loading = ref(false);
const failed = ref(false);
const now = ref(new Date());
const choices = ref<TimezoneChoice[]>([]);
const regions = [
  'All',
  'Asia',
  'Europe',
  'Americas',
  'Oceania',
  'Africa',
  'Other',
];
const locale = computed(() => i18n.global.locale.value);
const name = (item: TimezoneChoice) => timezoneName(item, locale.value);
const offset = (value: string) => formatTimezoneOffset(value, now.value);
const current = computed(
  () =>
    timezoneStore.options.find(
      (item) => item.value === timezoneStore.timezone,
    ) || {
      label: timezoneStore.timezone,
      value: timezoneStore.timezone,
    },
);
const selection = computed(() =>
  choices.value.find((item) => item.value === selected.value),
);
const filtered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return choices.value.filter(
    (item) =>
      (region.value === 'All' || (item.region || 'Other') === region.value) &&
      (!keyword ||
        [
          item.value,
          item.label,
          ...Object.values(item.name || {}),
          offset(item.value),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(keyword)),
  );
});
let timer: ReturnType<typeof setInterval> | undefined;
let request = 0;
function stopClock() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
onUnmounted(() => {
  request++;
  stopClock();
});

async function loadOptions() {
  const version = ++request;
  loading.value = true;
  failed.value = false;
  try {
    const options = await timezoneStore.getTimezoneOptions();
    if (version === request) choices.value = options;
  } catch {
    if (version === request) failed.value = true;
  } finally {
    if (version === request) loading.value = false;
  }
}

const [Modal, modalApi] = useVbenModal({
  fullscreenButton: false,
  centered: true,
  zIndex: 2100,
  onConfirm: async () => {
    if (!selected.value || loading.value || failed.value) return;
    try {
      modalApi.setState({ confirmLoading: true });
      await timezoneStore.setTimezone(selected.value);
      modalApi.close();
    } finally {
      modalApi.setState({ confirmLoading: false });
    }
  },
  onOpenChange(isOpen) {
    stopClock();
    if (!isOpen) {
      request++;
      return;
    }
    selected.value = timezoneStore.timezone;
    query.value = '';
    region.value = 'All';
    now.value = new Date();
    timer = setInterval(() => {
      now.value = new Date();
    }, 1000);
    void loadOptions();
  },
});

function open() {
  modalApi.open();
}
defineExpose({ open });
</script>

<template>
  <div :class="{ 'w-full': settingsEntry }">
    <button
      v-if="settingsEntry"
      type="button"
      class="hover:bg-accent my-1 flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-sm"
      data-testid="settings-timezone"
      :aria-label="`${$t('preferences.timezone')}: ${name(current)} ${offset(current.value)}`"
      @click="open"
    >
      <span>{{ $t('preferences.timezone') }}</span>
      <span class="flex min-w-0 items-center gap-2">
        <span class="text-right"
          ><span class="block">{{ name(current) }}</span
          ><span class="text-muted-foreground text-xs">{{
            offset(current.value)
          }}</span></span
        >
        <ChevronIcon class="size-4 shrink-0 text-muted-foreground" />
      </span>
    </button>
    <VbenIconButton
      v-else-if="showButton"
      :tooltip="$t('ui.widgets.timezone.setTimezone')"
      :aria-label="$t('ui.widgets.timezone.setTimezone')"
      @click="open"
    >
      <TimezoneIcon class="size-4 text-foreground" />
      <span class="sr-only">{{ $t('ui.widgets.timezone.setTimezone') }}</span>
    </VbenIconButton>
    <Modal
      :title="$t('ui.widgets.timezone.setTimezone')"
      :confirm-text="$t('ui.widgets.timezone.save')"
      :confirm-disabled="
        loading || failed || !selected || selected === timezoneStore.timezone
      "
      class="w-[620px] max-w-[calc(100vw-2rem)]"
      content-class="px-6 pb-5 pt-2"
    >
      <div class="relative">
        <SearchIcon
          class="text-muted-foreground pointer-events-none absolute left-3 top-3 size-4"
        />
        <Input
          v-model="query"
          :aria-label="$t('ui.widgets.timezone.search')"
          :placeholder="$t('ui.widgets.timezone.search')"
          class="h-10 pl-9"
        />
      </div>
      <div
        class="my-3 flex flex-wrap gap-1"
        :aria-label="$t('ui.widgets.timezone.region')"
      >
        <button
          v-for="item in regions"
          :key="item"
          type="button"
          class="rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="
            region === item
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent'
          "
          :aria-pressed="region === item"
          @click="region = item"
        >
          {{ $t(`ui.widgets.timezone.regions.${item}`) }}
        </button>
      </div>
      <div
        class="text-muted-foreground mb-2 flex justify-between gap-2 px-3 text-xs"
      >
        <span
          >{{ $t('ui.widgets.timezone.common')
          }}<template v-if="!loading && !failed">
            · {{ filtered.length }}</template
          ></span
        >
        <span>{{ $t('ui.widgets.timezone.offset') }}</span>
      </div>
      <div class="h-[324px] overflow-y-auto pr-1" :aria-busy="loading">
        <div
          v-if="loading"
          class="space-y-2"
          role="status"
          :aria-label="$t('ui.widgets.timezone.loading')"
        >
          <div
            v-for="n in 5"
            :key="n"
            class="bg-muted h-14 animate-pulse rounded-lg motion-reduce:animate-none"
          ></div>
        </div>
        <div
          v-else-if="failed"
          class="flex h-full flex-col items-center justify-center gap-3 text-sm"
          role="alert"
        >
          <button
            type="button"
            class="text-primary rounded-md border px-4 py-2"
            @click="loadOptions"
          >
            {{ $t('ui.widgets.timezone.retry') }}
          </button>
        </div>
        <div
          v-else-if="!filtered.length"
          class="text-muted-foreground flex h-full items-center justify-center text-sm"
          role="status"
        >
          {{ $t('ui.widgets.timezone.empty') }}
        </div>
        <RadioGroup
          v-else
          v-model="selected"
          class="gap-1"
          :aria-label="$t('ui.widgets.timezone.common')"
        >
          <label
            v-for="item in filtered"
            :key="item.value"
            :for="`${id}-${item.value}`"
            class="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2"
            :class="
              selected === item.value
                ? 'border-primary/30 bg-primary/5'
                : 'hover:bg-accent border-transparent'
            "
          >
            <RadioGroupItem
              :id="`${id}-${item.value}`"
              :value="item.value"
              class="shrink-0"
            />
            <span class="min-w-0 flex-1"
              ><span class="block text-sm font-medium">{{ name(item) }}</span
              ><span class="text-muted-foreground block break-all text-xs">{{
                item.value
              }}</span></span
            >
            <span class="shrink-0 text-xs tabular-nums sm:text-sm">{{
              offset(item.value)
            }}</span>
          </label>
        </RadioGroup>
      </div>
      <div
        v-if="selection && !loading && !failed"
        class="bg-muted/60 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3"
        aria-live="polite"
      >
        <div>
          <div class="text-muted-foreground text-xs">
            {{ $t('ui.widgets.timezone.selected') }}
          </div>
          <div class="mt-1 text-sm">
            {{ name(selection) }} · {{ offset(selected) }}
          </div>
        </div>
        <span class="text-sm tabular-nums" aria-live="off">{{
          formatTimezoneTime(selected, now)
        }}</span>
      </div>
      <template #prepend-footer>
        <span class="text-muted-foreground mr-auto text-xs">{{
          $t('ui.widgets.timezone.dst')
        }}</span>
      </template>
    </Modal>
  </div>
</template>

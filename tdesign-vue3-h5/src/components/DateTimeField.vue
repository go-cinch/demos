<script setup lang="ts">
import { ref, watch } from 'vue';
import { DateTimePicker } from 'tdesign-mobile-vue';
import dayjs from 'dayjs';
import { dateTime, parseDateTime } from '../lib/format';
import { t } from '../locales';
import Icon from './Icon.vue';
import Sheet from './Sheet.vue';
const model = defineModel<string>({ default: '' });
defineProps<{ name: string; id: string }>();
const open = ref(false);
const draft = ref('');
const picker = ref<InstanceType<typeof DateTimePicker>>();
watch(
  picker,
  (instance) => {
    const root = instance?.$el as HTMLElement | undefined;
    for (const button of root?.querySelectorAll<HTMLElement>(
      '.t-picker__cancel, .t-picker__confirm',
    ) || []) {
      button.setAttribute('role', 'button');
      button.tabIndex = 0;
      button.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          button.click();
        }
      };
    }
  },
  { flush: 'post' },
);
function pick() {
  draft.value = parseDateTime(model.value).isValid()
    ? model.value
    : dateTime(dayjs().add(1, 'day').valueOf());
  open.value = true;
}
function confirm(value: string | number) {
  model.value = typeof value === 'string' ? value : dateTime(value);
  open.value = false;
}
</script>
<template>
  <div class="date-time-input">
    <t-input :id="id" v-model="model" :name="name" :placeholder="t('dateFormat')" />
    <button type="button" class="date-picker-trigger" @click="pick">
      <Icon name="time" :size="17" /><span>{{ t('pickDateTime') }}</span>
      <Icon name="chevron-right" :size="15" />
    </button>
    <div class="time-presets">
      <button
        v-for="[label, hours] in [
          ['oneHour', 1],
          ['oneDay', 24],
          ['oneWeek', 168],
        ] as const"
        :key="label"
        type="button"
        @click="model = dateTime(dayjs().add(hours, 'hour').valueOf())"
      >
        {{ t(label) }}
      </button>
    </div>
  </div>
  <Sheet v-model="open" :title="t('pickDateTime')">
    <DateTimePicker
      ref="picker"
      class="cinch-date-picker"
      v-model="draft"
      mode="second"
      format="YYYY-MM-DD HH:mm:ss"
      :render-label="(_type: string, value: number) => String(value).padStart(2, '0')"
      :start="dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss')"
      :end="dayjs().add(20, 'year').format('YYYY-MM-DD HH:mm:ss')"
      :cancel-btn="t('cancel')"
      :confirm-btn="t('done')"
      @cancel="open = false"
      @confirm="confirm"
    >
      <template #header
        ><div class="date-column-labels" aria-hidden="true">
          <span v-for="part in ['year', 'month', 'day', 'hour', 'minute', 'second']" :key="part">{{
            t(`datePart.${part}`)
          }}</span>
        </div></template
      >
    </DateTimePicker>
  </Sheet>
</template>

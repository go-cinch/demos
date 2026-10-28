<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { $t } from '@/locales'
  const props = withDefaults(defineProps<{ modelValue?: string; label: string }>(), {
      modelValue: ''
    }),
    emit = defineEmits<{ 'update:modelValue': [string] }>()
  const rows = ref(props.modelValue.split(/\r?\n/))
  let last = props.modelValue
  watch(
    () => props.modelValue,
    (value) => {
      if (last !== value) {
        last = value
        rows.value = value.split(/\r?\n/)
      }
    }
  )
  function publish() {
    last = rows.value.join('\n')
    emit('update:modelValue', last)
  }
  function split() {
    rows.value = rows.value.flatMap((row) => row.split(/\r?\n/))
    publish()
  }
</script>
<template>
  <div class="rule-editor" data-testid="rule-list-editor"
    ><div v-for="(_, index) in rows" :key="index" class="rule-entry"
      ><ElInput
        v-model="rows[index]"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 4 }"
        :aria-label="`${label} ${index + 1}`"
        @input="publish"
        @blur="split"
      /><ElButton
        :aria-label="$t('pc.system-editor.removeItem', { name: `${label} ${index + 1}` })"
        @click="
          () => {
            rows.splice(index, 1)
            publish()
          }
        "
        >−</ElButton
      ></div
    ><ElButton
      class="w-full"
      @click="
        () => {
          rows.push('')
          publish()
        }
      "
      >{{ $t('pc.system-editor.addItem', { entity: label }) }}</ElButton
    ></div
  >
</template>
<style scoped>
  .rule-editor {
    display: grid;
    gap: 10px;
    width: 100%;
  }
  .rule-entry {
    display: flex;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
  }
</style>

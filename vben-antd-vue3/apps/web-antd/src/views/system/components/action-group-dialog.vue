<script setup lang="ts">
import type { GroupCatalog } from './action-groups';
import { reactive, ref, watch } from 'vue';
import { Modal } from 'ant-design-vue';
import { $t } from '#/locales';
import ActionGroupForm from './action-group-form.vue';

const props = defineProps<{ open: boolean; scope?: string; existingWords?: string[]; originalWord?: string; document?: GroupCatalog }>();
const emit = defineEmits<{ 'update:open': [boolean]; created: [string]; saved: [string, GroupCatalog?] }>();
const form = ref<InstanceType<typeof ActionGroupForm>>();
const state = reactive({ loading: true, saving: false, ready: false });
watch(() => props.open, (open) => { if (open) Object.assign(state, { loading: true, saving: false, ready: false }); });
function close() { if (!state.saving) emit('update:open', false); }
function saved(word: string, document?: GroupCatalog) {
  if (!props.originalWord) emit('created', word);
  emit('saved', word, document);
  emit('update:open', false);
}
</script>

<template>
  <Modal :open="open" :title="$t(originalWord ? 'action-editor.editGroup' : 'action-editor.createGroup')" width="min(760px, calc(100vw - 32px))" :confirm-loading="state.saving" :closable="!state.saving" :mask-closable="!state.saving" :keyboard="!state.saving" :cancel-button-props="{ disabled: state.saving }" :ok-button-props="{ disabled: state.loading || !state.ready }" :ok-text="$t(originalWord ? 'system-editor.save' : 'system.common.create')" :cancel-text="$t('system-editor.cancel')" @cancel="close" @ok="form?.save()">
    <ActionGroupForm v-if="open" ref="form" :scope="scope" :existing-words="existingWords" :original-word="originalWord" :document="document" @state="Object.assign(state, $event)" @saved="saved" />
  </Modal>
</template>

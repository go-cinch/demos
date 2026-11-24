<script setup lang="ts">
import type { Draft } from './catalog-model';

import { computed, provide } from 'vue';

import { catalogEditorKey } from './catalog-editor-context';

const props = defineProps<{ draft: Draft }>();
provide(catalogEditorKey, {
  catalog: computed(() => props.draft.document),
  ui: computed(() => props.draft.ui),
});
</script>

<template><slot></slot></template>

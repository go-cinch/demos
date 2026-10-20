<script setup lang="ts">
import type { LocationQueryRaw } from 'vue-router';
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAccessStore } from '@vben/stores';
import { usePermissions } from '#/composables/use-permissions';

defineOptions({ inheritAttrs: false });
const props = defineProps<{ path: string; query?: LocationQueryRaw }>();
const router = useRouter();
const accessStore = useAccessStore();
const { hasPage } = usePermissions();
const canNavigate = computed(() => {
  // Route registration completes after the permission response is applied.
  // Re-evaluate when the rebuilt route set is published or navigation completes.
  void accessStore.accessRoutes;
  void router.currentRoute.value;
  return hasPage(props.path) && router.resolve({ path: props.path }).matched.some((route) => route.path === props.path);
});
</script>
<template>
  <RouterLink v-if="canNavigate" v-bind="$attrs" :to="{ path, query }"><slot /></RouterLink>
  <span v-else><slot /></span>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

import { Settings } from '@vben/icons';

import { VbenIconButton } from '@vben-core/shadcn-ui';

import Preferences from './preferences.vue';
import { useOpenPreferences } from './use-open-preferences';

const emit = defineEmits<{ clearPreferencesAndLogout: [] }>();

function clearPreferencesAndLogout() {
  emit('clearPreferencesAndLogout');
}

const preferencesRef = ref<InstanceType<typeof Preferences> | null>(null);
const sharedOpenPreferences = useOpenPreferences();
const openPreferences =
  sharedOpenPreferences ?? (() => preferencesRef.value?.open());
</script>

<template>
  <div>
    <Preferences
      v-if="!sharedOpenPreferences"
      ref="preferencesRef"
      :show-button="false"
      @clear-preferences-and-logout="clearPreferencesAndLogout"
    />
    <VbenIconButton
      class="hover:animate-[shrink_0.3s_ease-in-out]"
      @click="openPreferences"
    >
      <Settings class="size-4 text-foreground" />
    </VbenIconButton>
  </div>
</template>

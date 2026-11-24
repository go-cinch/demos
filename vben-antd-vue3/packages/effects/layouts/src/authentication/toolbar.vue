<script setup lang="ts">
import type { ToolbarType } from './types';

import { computed } from 'vue';

import { preferences } from '@vben/preferences';

import {
  AuthenticationColorToggle,
  AuthenticationLayoutToggle,
  LanguageToggle,
  ThemeToggle,
  TimezoneButton,
} from '../widgets';

interface Props {
  toolbarList?: ToolbarType[];
}

defineOptions({
  name: 'AuthenticationToolbar',
});

const props = withDefaults(defineProps<Props>(), {
  toolbarList: () => ['color', 'language', 'layout', 'timezone', 'theme'],
});

const showColor = computed(() => props.toolbarList.includes('color'));
const showLayout = computed(() => props.toolbarList.includes('layout'));
const showLanguage = computed(() => props.toolbarList.includes('language'));
const showTimezone = computed(() => props.toolbarList.includes('timezone'));
const showTheme = computed(() => props.toolbarList.includes('theme'));
</script>

<template>
  <div
    :class="{
      'rounded-lg bg-accent px-3 py-1': toolbarList.length > 1,
    }"
    class="absolute top-4 right-2 z-10 flex-center"
  >
    <!-- Only show on medium and larger screens -->
    <div class="hidden md:flex">
      <AuthenticationColorToggle v-if="showColor" />
      <AuthenticationLayoutToggle v-if="showLayout" />
    </div>
    <!-- Always show Language and Theme toggles -->
    <LanguageToggle v-if="showLanguage && preferences.widget.languageToggle" />
    <TimezoneButton v-if="showTimezone && preferences.widget.timezone" />
    <ThemeToggle v-if="showTheme && preferences.widget.themeToggle" />
  </div>
</template>

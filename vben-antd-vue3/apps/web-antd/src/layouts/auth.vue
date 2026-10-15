<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { AuthPageLayout } from '@vben/layouts';
import { preferences, usePreferences } from '@vben/preferences';

import { $t } from '#/locales';

import AuthJourney from './auth-journey.vue';

const route = useRoute();
const { authPanelLeft, isDark } = usePreferences();
const appName = computed(() => preferences.app.name);
const logo = computed(() => preferences.logo.source);
const logoDark = computed(() => preferences.logo.sourceDark);
</script>

<template>
  <AuthPageLayout
    :app-name="appName"
    :logo="logo"
    :logo-dark="logoDark"
    illustration-full-bleed
    :page-description="$t('authentication.pageDesc')"
    :page-title="$t('authentication.pageTitle')"
  >
    <template #illustration>
      <AuthJourney
        :key="route.path"
        :dark="isDark"
        :form-on-left="authPanelLeft"
      />
    </template>
  </AuthPageLayout>
</template>

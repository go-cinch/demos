<script setup lang="ts">
import { t } from '../locales';
</script>
<template>
  <section class="page empty-page">
    <h1>404</h1>
    <p>{{ t('notFound') }}</p>
    <RouterLink to="/dashboard/overview">{{ t('home') }}</RouterLink>
  </section>
</template>

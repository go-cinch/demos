<script setup lang="ts">
import { computed } from 'vue';
import { IconifyIcon } from '@vben/icons';
import { Input, Select, Tag } from 'ant-design-vue';
import { $t } from '#/locales';
import type { Catalog } from './catalog-model';

const props = defineProps<{ catalog: Catalog; disabled: boolean }>();
const t = (key: string) => $t(`developer.${key}`);
const localeOptions = computed(() =>
  props.catalog.locales
    .filter((locale) => locale.enabled)
    .map((locale) => ({
      value: locale.tag,
      label: `${locale.name} (${locale.tag})`,
    })),
);
</script>

<template>
  <section class="catalog-languages" :aria-label="t('languages')">
    <header class="catalog-section-heading">
      <h2>{{ t('languages') }}</h2>
      <p>{{ t('languagesDescription') }}</p>
    </header>

    <div class="catalog-language-default">
      <div>
        <label for="catalog-default-locale">{{ t('defaultLocale') }}</label>
        <p class="catalog-muted">{{ t('defaultLocaleHint') }}</p>
      </div>
      <Select
        id="catalog-default-locale"
        v-model:value="catalog.default_locale"
        :aria-label="t('defaultLocale')"
        :disabled="disabled"
        :options="localeOptions"
      />
    </div>

    <div class="catalog-language-grid">
      <article
        v-for="locale in catalog.locales"
        :key="locale.tag"
        class="catalog-language"
        :class="{
          'catalog-language--default': catalog.default_locale === locale.tag,
        }"
      >
        <header class="catalog-language-heading">
          <div class="catalog-language-identity">
            <span class="catalog-language-symbol" aria-hidden="true">{{
              locale.tag === 'zh-CN' ? '文' : 'Aa'
            }}</span>
            <div>
              <h3>{{ locale.tag === 'zh-CN' ? t('zh') : 'English' }}</h3>
              <code>{{ locale.tag }}</code>
            </div>
          </div>
          <Tag v-if="catalog.default_locale === locale.tag" color="blue">
            {{ t('defaultLocale') }}
          </Tag>
        </header>

        <div class="catalog-language-field">
          <label :for="`catalog-language-name-${locale.tag}`">{{
            t('languageName')
          }}</label>
          <Input
            :id="`catalog-language-name-${locale.tag}`"
            v-model:value="locale.name"
            :disabled="disabled"
            :aria-label="`${t('languageName')} ${locale.tag}`"
          />
        </div>
      </article>
    </div>

    <p class="catalog-language-note catalog-muted">
      <IconifyIcon icon="lucide:info" aria-hidden="true" />
      {{ t('languageHint') }}
    </p>
  </section>
</template>

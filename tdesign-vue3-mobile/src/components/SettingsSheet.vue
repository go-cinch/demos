<script setup lang="ts">
import { preferences as p } from '../lib/preferences';
import { t } from '../locales';
import Sheet from './Sheet.vue';
import Field from './Field.vue';
const visible = defineModel<boolean>({ default: false });
</script>
<template>
  <Sheet v-model="visible" :title="t('settings')"
    ><h3>{{ t('appearance') }}</h3>
    <div class="switch-row">
      <span>{{ t('dark') }}</span
      ><t-switch v-model="p.dark" :aria-label="t('dark')" />
    </div>
    <div class="switch-row">
      <span>{{ t('reduced') }}</span
      ><t-switch v-model="p.reducedTransparency" :aria-label="t('reduced')" />
    </div>
    <Field name="accent" :label="t('color')"
      ><t-radio-group v-model="p.accent" class="radio-options"
        ><t-radio :block="false" value="moon" :label="t('blue')" /><t-radio
          :block="false"
          value="green"
          :label="t('green')" /><t-radio
          :block="false"
          value="violet"
          :label="t('violet')" /></t-radio-group
    ></Field>
    <h3>{{ t('layout') }}</h3>
    <div class="switch-row">
      <span>{{ t('footer') }}</span
      ><t-switch v-model="p.footer" :aria-label="t('footer')" />
    </div>
    <section class="copyright-settings">
      <h3>{{ t('copyright') }}</h3>
      <div class="switch-row">
        <span>{{ t('copyrightEnabled') }}</span
        ><t-switch v-model="p.copyright" :aria-label="t('copyrightEnabled')" />
      </div>
      <Field name="copyright-date" :label="t('copyrightDate')" :hint="t('autoYear')"
        ><t-input id="copyright-date" v-model="p.copyrightDate" /></Field
      ><Field name="company" :label="t('company')"
        ><t-input id="company" v-model="p.company" /></Field
      ><Field name="company-link" :label="t('companyLink')"
        ><t-input id="company-link" v-model="p.companyLink" /></Field
      ><Field name="icp" :label="t('icp')"><t-input id="icp" v-model="p.icp" /></Field
      ><Field name="icp-link" :label="t('icpLink')"
        ><t-input id="icp-link" v-model="p.icpLink"
      /></Field>
    </section>
    <t-button block theme="primary" @click="visible = false">{{ t('done') }}</t-button></Sheet
  >
</template>

<script setup lang="ts">
import { preferences as p, type ThemePalette } from '../lib/preferences';
import { t } from '../locales';
import Sheet from './Sheet.vue';
import Field from './Field.vue';
const visible = defineModel<boolean>({ default: false });
const palettes: ThemePalette[] = ['graphite', 'jade', 'berry'];
function paletteKeyboard(event: KeyboardEvent, index: number) {
  let target: number;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
    target = (index + 1) % palettes.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
    target = (index + palettes.length - 1) % palettes.length;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = palettes.length - 1;
  else return;
  event.preventDefault();
  p.accent = palettes[target];
  (event.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    [target]?.focus();
}
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
      ><div class="theme-palette-options" role="radiogroup">
        <button
          v-for="(palette, index) in palettes"
          :key="palette"
          type="button"
          class="theme-palette-option"
          :class="{ 'is-selected': p.accent === palette }"
          :data-palette="palette"
          role="radio"
          :aria-checked="p.accent === palette"
          :tabindex="p.accent === palette ? 0 : -1"
          @click="p.accent = palette"
          @keydown="paletteKeyboard($event, index)"
        >
          <span class="theme-palette-swatch" aria-hidden="true">
            <span class="theme-palette-swatch-base" />
            <span class="theme-palette-swatch-surface" />
            <span class="theme-palette-swatch-accent" />
          </span>
          <span class="theme-palette-name">{{ t(palette) }}</span>
          <span v-if="p.accent === palette" class="theme-palette-selected">
            {{ t('selectedPalette') }}
          </span>
          <span v-if="palette === 'graphite'" class="theme-palette-default">
            {{ t('defaultPalette') }}
          </span>
        </button>
      </div>
    </Field>
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

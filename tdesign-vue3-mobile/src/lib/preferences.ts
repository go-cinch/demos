import { reactive, watch } from 'vue';
import { readStored, writeStored } from './storage';

export type ThemePalette = 'graphite' | 'jade' | 'berry';

function themePalette(value: unknown): ThemePalette {
  if (value === 'jade' || value === 'green') return 'jade';
  if (value === 'berry' || value === 'violet') return 'berry';
  return 'graphite';
}

const defaults = {
  dark: false,
  reducedTransparency: false,
  accent: 'graphite' as ThemePalette,
  loginPosition: 'center',
  footer: true,
  timezone: 'Asia/Shanghai',
  copyright: true,
  copyrightDate: '',
  company: 'go-cinch',
  companyLink: 'https://github.com/go-cinch/demos',
  icp: '',
  icpLink: '',
};
const stored = readStored<Partial<typeof defaults>>('cinch-mobile-preferences', {});
export const preferences = reactive({
  ...defaults,
  ...stored,
  accent: themePalette(stored?.accent),
});
watch(
  preferences,
  () => {
    writeStored('cinch-mobile-preferences', preferences);
    document.documentElement.dataset.theme = preferences.dark ? 'dark' : 'light';
    document
      .querySelector('link[rel="icon"][type="image/svg+xml"]')
      ?.setAttribute(
        'href',
        `${import.meta.env.BASE_URL}${preferences.dark ? 'go-cinch-white.svg' : 'go-cinch.svg'}`,
      );
    document.documentElement.setAttribute('theme-mode', preferences.dark ? 'dark' : 'light');
    document.documentElement.dataset.reduced = String(preferences.reducedTransparency);
    document.documentElement.dataset.accent = preferences.accent;
  },
  { deep: true, immediate: true },
);

import { reactive, watch } from 'vue';
import { readStored, writeStored } from './storage';
const defaults = {
  dark: false,
  reducedTransparency: false,
  accent: 'moon',
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
export const preferences = reactive({
  ...defaults,
  ...readStored<Partial<typeof defaults>>('cinch-mobile-preferences', {}),
});
watch(
  preferences,
  () => {
    writeStored('cinch-mobile-preferences', preferences);
    document.documentElement.dataset.theme = preferences.dark ? 'dark' : 'light';
    document.documentElement.setAttribute('theme-mode', preferences.dark ? 'dark' : 'light');
    document.documentElement.dataset.reduced = String(preferences.reducedTransparency);
    document.documentElement.dataset.accent = preferences.accent;
  },
  { deep: true, immediate: true },
);

import { proxy, subscribe } from 'valtio';
import { readStored, writeStored } from './storage';
const defaults = {
  dark: false,
  reducedTransparency: false,
  accent: 'garnet',
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
export const preferences = proxy({
  ...defaults,
  ...readStored<Partial<typeof defaults>>('cinch-garnet-preferences', {}),
});
function applyPreferences() {
  writeStored('cinch-garnet-preferences', preferences);
  document.documentElement.dataset.theme = preferences.dark ? 'dark' : 'light';
  document.documentElement.dataset.prefersColorScheme = preferences.dark ? 'dark' : 'light';
  document.documentElement.dataset.reduced = String(preferences.reducedTransparency);
  document.documentElement.dataset.accent = preferences.accent;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', preferences.dark ? '#242124' : '#f6f3f4');
}
subscribe(preferences, applyPreferences);
applyPreferences();

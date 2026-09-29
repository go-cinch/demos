import { createApp } from 'vue';
import {
  Button,
  Checkbox,
  ConfigProvider,
  Empty,
  Loading,
  Popup,
  RadioGroup,
  Search,
  Skeleton,
  Tag,
  Textarea,
} from 'tdesign-mobile-vue';
import 'tdesign-mobile-vue/es/style/index.css';
import './style.css';
import App from './App.vue';
import { router } from './router';
import AccessibleSwitch from './components/AccessibleSwitch.vue';
import AccessibleInput from './components/AccessibleInput.vue';
import AccessibleRadio from './components/AccessibleRadio.vue';

// Keep the mobile admin shell at its designed scale. Browser-menu zoom remains
// controlled by the browser and cannot be disabled by a web application.
document.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  },
  { passive: false },
);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) {
    event.preventDefault();
  }
});
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}
const app = createApp(App);
for (const [name, component] of Object.entries({
  Button,
  Checkbox,
  ConfigProvider,
  Empty,
  Loading,
  Popup,
  RadioGroup,
  Search,
  Skeleton,
  Tag,
  Textarea,
}))
  app.component(
    `t-${name.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)}`,
    component,
  );
app
  .component('t-switch', AccessibleSwitch)
  .component('t-input', AccessibleInput)
  .component('t-radio', AccessibleRadio)
  .use(router)
  .mount('#app');
router.isReady().finally(() => {
  requestAnimationFrame(() => document.querySelector('#app-bootstrap-loading')?.remove());
});

import { createApp, h, nextTick } from 'vue';

import {
  onUserPreferencesChange,
  preferences,
  updatePreferences,
} from '@vben/preferences';

import { expect, it, vi } from 'vitest';

import { required } from '../../../../../scripts/test-utils/required';
import LayoutToggle from './layout-toggle.vue';

vi.mock('@vben/locales', async (original) => ({
  ...(await original<typeof import('@vben/locales')>()),
  $t: (key: string) => key,
}));

it('emits the three authentication layout choices', async () => {
  const original = preferences.app.authPageLayout;
  updatePreferences({ app: { authPageLayout: 'panel-right' } });
  const changes = vi.fn();
  const unsubscribe = onUserPreferencesChange(changes);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(LayoutToggle) });
  app.mount(host);
  try {
    for (const [label, value, icon] of [
      ['alignLeft', 'panel-left', '.lucide-panel-left'],
      ['center', 'panel-center', '.lucide-inspection-panel'],
      ['alignRight', 'panel-right', '.lucide-panel-right'],
    ] as const) {
      const trigger = host.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="menu"]',
      );
      expect(trigger).not.toBeNull();
      required(trigger).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      const option = await vi.waitFor(() => {
        const item = [
          ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        ].find(
          (entry) =>
            entry.textContent?.trim() === `authentication.layout.${label}`,
        );
        expect(item).toBeDefined();
        return required(item);
      });
      option.click();
      await nextTick();
      expect(changes).toHaveBeenLastCalledWith({
        preferences: { app: { authPageLayout: value } },
      });
      expect(preferences.app.authPageLayout).toBe(value);
      expect(required(trigger).querySelector(icon)).not.toBeNull();
    }
  } finally {
    app.unmount();
    host.remove();
    unsubscribe();
    updatePreferences({ app: { authPageLayout: original } });
  }
});

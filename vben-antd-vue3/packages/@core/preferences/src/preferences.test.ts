import { expect, it } from 'vitest';

import { defaultPreferences } from './config';
import { preferencesManager } from './preferences';
import { usePreferences } from './use-preferences';

it('hydrates every supported layout and widget position', async () => {
  const view = usePreferences();
  const layouts = [
    ['sidebar-nav', 'isSideNav'],
    ['sidebar-mixed-nav', 'isSideMixedNav'],
    ['header-nav', 'isHeaderNav'],
    ['header-sidebar-nav', 'isHeaderSidebarNav'],
    ['mixed-nav', 'isMixedNav'],
    ['header-mixed-nav', 'isHeaderMixedNav'],
    ['full-content', 'isFullContent'],
  ] as const;
  const position = {
    auto: { fixed: false, header: true, userDropdown: false },
    fixed: { fixed: true, header: false, userDropdown: false },
    header: { fixed: false, header: true, userDropdown: false },
    'user-dropdown': { fixed: false, header: false, userDropdown: true },
    none: { fixed: false, header: false, userDropdown: false },
  };
  try {
    for (const [layout, flag] of layouts) {
      preferencesManager.updatePreferences({
        app: {
          enablePreferences: true,
          isMobile: false,
          layout,
          preferencesButtonPosition: 'auto',
        },
        header: { enable: true, hidden: false },
        sidebar: { hidden: false },
      });
      expect(view.layout.value).toBe(layout);
      for (const [, candidate] of layouts)
        expect(view[candidate].value, `${layout}: ${candidate}`).toBe(
          candidate === flag,
        );
      expect(view.preferencesButtonPosition.value).toEqual(
        layout === 'full-content' ? position.fixed : position.header,
      );
    }
    for (const placement of [
      'auto',
      'fixed',
      'header',
      'user-dropdown',
      'none',
    ] as const) {
      preferencesManager.updatePreferences({
        app: { layout: 'sidebar-nav', preferencesButtonPosition: placement },
      });
      expect(view.preferencesButtonPosition.value).toEqual(position[placement]);
    }
    preferencesManager.updatePreferences({
      app: { preferencesButtonPosition: 'auto' },
      header: { enable: false },
    });
    expect(view.preferencesButtonPosition.value).toEqual(position.fixed);

    for (const placement of ['header', 'user-dropdown', 'none'] as const) {
      const widget = {
        fullscreenButtonPosition: placement,
        globalSearchButtonPosition: placement,
        languageToggleButtonPosition: placement,
        lockScreenButtonPosition: placement,
        logoutButtonPosition: placement,
        notificationButtonPosition: placement,
        refreshButtonPosition: placement,
        themeToggleButtonPosition: placement,
        timezoneButtonPosition: placement,
      };
      preferencesManager.updatePreferences({ widget });
      expect(preferencesManager.getPreferences().widget).toMatchObject(widget);
      expect(preferencesManager.getPreferences().widget.order).toEqual(
        defaultPreferences.widget.order,
      );
    }
  } finally {
    await preferencesManager.resetPreferences();
  }
});

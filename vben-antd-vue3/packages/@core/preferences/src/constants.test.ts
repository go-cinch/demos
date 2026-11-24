import { convertToHslCssVar, TinyColor } from '@vben-core/shared/color';

import { expect, it } from 'vitest';

import { defaultPreferences } from './config';
import { BUILT_IN_THEME_PRESETS } from './constants';
import { updateCSSVariables } from './update-css-variables';

it('resolves every visible builtin theme', () => {
  const colors = [
    ['violet', 'hsl(245 82% 67%)'],
    ['pink', 'hsl(347 77% 60%)'],
    ['yellow', 'hsl(42 84% 61%)'],
    ['sky-blue', 'hsl(231 98% 65%)'],
    ['green', 'hsl(161 90% 43%)'],
    ['zinc', 'hsl(240 5.9% 10%)', 'hsl(0 0% 98%)'],
    ['deep-green', 'hsl(181 84% 32%)'],
    ['deep-blue', 'hsl(211 91% 39%)'],
    ['orange', 'hsl(18 89% 40%)'],
    ['rose', 'hsl(0 75% 42%)'],
    ['neutral', 'hsl(240 5.9% 10%)', 'hsl(0 0% 98%)'],
    ['slate', 'hsl(240 5.9% 10%)', 'hsl(0 0% 98%)'],
    ['gray', 'hsl(240 5.9% 10%)', 'hsl(0 0% 98%)'],
    ['default', 'hsl(212 100% 45%)'],
  ] as const;
  expect(BUILT_IN_THEME_PRESETS.map(({ type }) => type).toSorted()).toEqual(
    [...colors.map(([type]) => type), 'custom'].toSorted(),
  );

  const root = document.documentElement;
  try {
    for (const [type, primary, darkPrimary = primary] of colors) {
      for (const mode of ['light', 'dark'] as const) {
        const preferences = structuredClone(defaultPreferences);
        preferences.theme.builtinType = type;
        preferences.theme.mode = mode;
        updateCSSVariables(preferences);
        expect(root.dataset.theme, `${type} ${mode}`).toBe(type);
        const presetColor = mode === 'dark' ? darkPrimary : primary;
        const expected = convertToHslCssVar(
          new TinyColor(presetColor).toHexString(),
        );
        expect(
          root.style.getPropertyValue('--primary'),
          `${type} ${mode}`,
        ).toBe(expected);
        expect(preferences.theme.colorPrimary).toBe(
          defaultPreferences.theme.colorPrimary,
        );
      }
    }
  } finally {
    root.removeAttribute('style');
    delete root.dataset.theme;
    root.classList.remove('dark');
  }
});

it('keeps the exact custom color after switching through a preset', () => {
  const root = document.documentElement;
  const preferences = structuredClone(defaultPreferences);
  preferences.theme.colorPrimary = '#abcdef';
  preferences.theme.mode = 'light';
  try {
    preferences.theme.builtinType = 'custom';
    updateCSSVariables(preferences);
    expect(root.style.getPropertyValue('--primary')).toBe('210 68% 80.3922%');

    preferences.theme.builtinType = 'zinc';
    updateCSSVariables(preferences);
    expect(root.style.getPropertyValue('--primary')).toBe('240 6% 10%');
    expect(preferences.theme.colorPrimary).toBe('#abcdef');

    preferences.theme.builtinType = 'custom';
    updateCSSVariables(preferences);
    expect(root.style.getPropertyValue('--primary')).toBe('210 68% 80.3922%');
  } finally {
    root.removeAttribute('style');
    delete root.dataset.theme;
    root.classList.remove('dark');
  }
});

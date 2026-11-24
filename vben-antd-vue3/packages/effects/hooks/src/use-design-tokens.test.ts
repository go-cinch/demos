import { effectScope, nextTick } from 'vue';

import { preferences } from '@vben/preferences';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { required } from '../../../../scripts/test-utils/required';
import { useAntdDesignTokens } from './use-design-tokens';

vi.mock('@vben/preferences', async () => {
  const { reactive } = await import('vue');
  return {
    preferences: reactive({ theme: { radius: '0.25', fontSize: 16 } }),
    usePreferences: vi.fn(),
  };
});
vi.mock('@vben/utils', () => ({
  convertToRgb: vi.fn(),
  updateCSSVariables: vi.fn(),
}));

let scope: ReturnType<typeof effectScope>;
afterEach(() => {
  scope?.stop();
  document.documentElement.style.removeProperty('font-size');
});

describe('ant Design radius preference', () => {
  it('updates every radius tier live and makes zero fully square', async () => {
    document.documentElement.style.fontSize = '16px';
    scope = effectScope();
    const { tokens } = required(scope.run(useAntdDesignTokens));
    for (const radius of ['0', '0.25', '0.5', '0.75', '1', '0']) {
      preferences.theme.radius = radius;
      await nextTick();
      const pixels = Number(radius) * 16;
      expect(tokens).toMatchObject({
        borderRadius: pixels,
        borderRadiusLG: pixels,
        borderRadiusSM: pixels / 2,
        borderRadiusXS: pixels / 4,
        borderRadiusOuter: pixels * 0.75,
      });
    }
  });

  it('keeps Ant pixel radii aligned with rem surfaces after a font-size change', async () => {
    preferences.theme.radius = '0.25';
    preferences.theme.fontSize = 16;
    document.documentElement.style.fontSize = '16px';
    scope = effectScope();
    const { tokens } = required(scope.run(useAntdDesignTokens));
    expect(tokens.borderRadius).toBe(4);
    preferences.theme.fontSize = 20;
    document.documentElement.style.fontSize = '20px';
    await nextTick();
    expect(tokens.borderRadius).toBe(5);
    expect(tokens.borderRadiusLG).toBe(5);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const key = 'cinch-mobile-preferences';
const stored = new Map<string, string>();
let dataset: Record<string, string>;
let attributes: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  stored.clear();
  dataset = {};
  attributes = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => stored.get(name) ?? null,
    setItem: (name: string, value: string) => stored.set(name, value),
    removeItem: (name: string) => stored.delete(name),
  });
  vi.stubGlobal('document', {
    documentElement: {
      dataset,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('mobile theme preferences', () => {
  it('defaults to graphite and applies it before user interaction', async () => {
    const { preferences } = await import('./preferences');
    expect(preferences.accent).toBe('graphite');
    expect(dataset).toMatchObject({ accent: 'graphite', theme: 'light', reduced: 'false' });
    expect(attributes.get('theme-mode')).toBe('light');
    expect(JSON.parse(stored.get(key)!)).toMatchObject({ accent: 'graphite' });
  });

  it.each([
    ['moon', 'graphite'],
    ['green', 'jade'],
    ['violet', 'berry'],
    ['graphite', 'graphite'],
    ['jade', 'jade'],
    ['berry', 'berry'],
  ])('restores %s as %s without resetting other preferences', async (accent, expected) => {
    const saved = {
      accent,
      dark: true,
      reducedTransparency: true,
      loginPosition: 'right',
      footer: false,
      timezone: 'Europe/London',
      copyright: false,
      copyrightDate: '2025–2026',
      company: 'Example company',
      companyLink: 'https://example.com',
      icp: 'ICP example',
      icpLink: 'https://example.com/icp',
    };
    stored.set(key, JSON.stringify(saved));
    const { preferences } = await import('./preferences');
    expect(preferences).toMatchObject({ ...saved, accent: expected });
    expect(JSON.parse(stored.get(key)!)).toMatchObject({ ...saved, accent: expected });
    expect(dataset).toMatchObject({ accent: expected, theme: 'dark', reduced: 'true' });
    expect(attributes.get('theme-mode')).toBe('dark');
  });

  it.each([undefined, null, '', 'unknown', false, 12])(
    'falls back to graphite for unsupported saved palette %s',
    async (accent) => {
      stored.set(key, JSON.stringify({ accent, timezone: 'Asia/Tokyo' }));
      const { preferences } = await import('./preferences');
      expect(preferences.accent).toBe('graphite');
      expect(preferences.timezone).toBe('Asia/Tokyo');
      expect(dataset.accent).toBe('graphite');
      expect(JSON.parse(stored.get(key)!)).toMatchObject({
        accent: 'graphite',
        timezone: 'Asia/Tokyo',
      });
    },
  );

  it('recovers from malformed saved JSON', async () => {
    stored.set(key, '{invalid');
    const { preferences } = await import('./preferences');
    expect(preferences.accent).toBe('graphite');
    expect(JSON.parse(stored.get(key)!)).toMatchObject({ accent: 'graphite' });
  });

  it('persists a selected palette and restores it with independent appearance settings', async () => {
    const { preferences } = await import('./preferences');
    preferences.accent = 'berry';
    preferences.dark = true;
    preferences.reducedTransparency = true;
    preferences.company = 'Custom company';
    await nextTick();
    expect(dataset).toMatchObject({ accent: 'berry', theme: 'dark', reduced: 'true' });
    expect(JSON.parse(stored.get(key)!)).toMatchObject({
      accent: 'berry',
      dark: true,
      reducedTransparency: true,
      company: 'Custom company',
    });

    vi.resetModules();
    const { preferences: restored } = await import('./preferences');
    expect(restored).toMatchObject({
      accent: 'berry',
      dark: true,
      reducedTransparency: true,
      company: 'Custom company',
    });
    restored.accent = 'jade';
    await nextTick();
    expect(dataset.accent).toBe('jade');
    expect(JSON.parse(stored.get(key)!)).toMatchObject({ accent: 'jade', dark: true });
  });
});

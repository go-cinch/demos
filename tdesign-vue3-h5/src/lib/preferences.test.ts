import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const key = 'cinch-moonwhite-preferences';
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
    querySelector: () => null,
    documentElement: {
      dataset,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('Moonwhite H5 theme preferences', () => {
  it('restores legacy preferences before persisting the current namespace', async () => {
    const saved = { accent: 'jade', dark: true, timezone: 'Asia/Tokyo', company: 'Saved company' };
    stored.set('cinch-mobile-preferences', JSON.stringify(saved));
    const { preferences } = await import('./preferences');
    expect(preferences).toMatchObject(saved);
    expect(JSON.parse(stored.get(key)!)).toMatchObject(saved);
    expect(stored.has('cinch-mobile-preferences')).toBe(false);
  });

  it.each(['legacy only', 'both namespaces'])(
    'uses the matching theme before app startup: %s',
    (scenario) => {
      stored.set('cinch-mobile-preferences', JSON.stringify({ accent: 'jade', dark: true }));
      if (scenario === 'both namespaces') {
        stored.set(key, JSON.stringify({ accent: 'berry', dark: false }));
      }
      const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      expect(script).toBeTruthy();
      const themeColor = { content: '' };
      runInNewContext(script!, {
        localStorage,
        document: {
          documentElement: {
            dataset,
            setAttribute: (name: string, value: string) => attributes.set(name, value),
          },
          querySelector: () => themeColor,
        },
      });
      expect(dataset).toMatchObject(
        scenario === 'legacy only'
          ? { accent: 'jade', theme: 'dark' }
          : { accent: 'berry', theme: 'light' },
      );
      expect(themeColor.content).toBe(scenario === 'legacy only' ? '#17231f' : '#f5f5f7');
    },
  );

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

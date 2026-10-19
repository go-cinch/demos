import { expect, it, vi } from 'vitest';
import { loadOptionPage } from './option-pages';
import type { RecordData } from './types';

const records: RecordData[] = Array.from({ length: 37 }, (_, i) => ({
  id: i + 1,
  name: `Name ${i + 1}`,
  word: `word.${i + 1}`,
  code: `CODE${i + 1}`,
  created_at: 0,
  updated_at: 0,
}));
it('makes all 37 choices reachable across two backend pages', async () => {
  const load = vi.fn(async (_kind, params) => ({
    p: params.p,
    s: params.s,
    t: records.length,
    items: records.slice((params.p - 1) * params.s, params.p * params.s),
  }));
  const first = await loadOptionPage('role', '', 1, load);
  const second = await loadOptionPage('role', '', 2, load);
  expect(first.items).toHaveLength(30);
  expect(first.hasMore).toBe(true);
  expect(second.items).toHaveLength(7);
  expect(second.hasMore).toBe(false);
  expect([...first.items, ...second.items].map((r) => r.value)).toEqual(records.map((r) => r.id));
});
it('deduplicates matches from both search fields and retains pagination from either one', async () => {
  const load = vi.fn(async (_kind, params) => ({
    p: 1,
    s: 30,
    t: params.name ? 37 : 1,
    items: params.name ? records.slice(0, 30) : records.slice(0, 1),
  }));
  const result = await loadOptionPage('action', ' word ', 1, load);
  expect(load.mock.calls.map(([, params]) => params)).toEqual([
    { p: 1, s: 30, name: 'word' },
    { p: 1, s: 30, word: 'word' },
  ]);
  expect(result.items).toHaveLength(30);
  expect(result.items[0].value).toBe('CODE1');
  expect(result.hasMore).toBe(true);
});

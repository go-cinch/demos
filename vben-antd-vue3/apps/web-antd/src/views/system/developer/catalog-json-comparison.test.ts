import { describe, expect, it } from 'vitest';

import { compareJson } from './catalog-json-comparison';

describe('catalog JSON comparison', () => {
  it('ignores object key order and preserves unchanged rows with independent line numbers', () => {
    const result = compareJson({ b: 2, a: 1 }, { a: 1, b: 2 });
    expect(result.blocks).toEqual([]);
    expect(result.localText).toBe(result.onlineText);
    result.rows.forEach((row, index) => {
      expect(row.block).toBeNull();
      expect(row.local?.number).toBe(index + 1);
      expect(row.online?.number).toBe(index + 1);
    });
  });

  it('retains exact identifier paths for a changed nested translation', () => {
    const result = compareJson(
      { messages: { 'en-US': { 'admin:system.user': 'Local' } } },
      { messages: { 'en-US': { 'admin:system.user': 'Online' } } },
    );
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.paths).toEqual([
      ['messages', 'en-US', 'admin:system.user'],
      ['messages', 'en-US', 'admin:system.user'],
    ]);
    const changed = result.rows[result.blocks[0]!.start]!;
    expect(changed.local?.text).toContain('Local');
    expect(changed.online?.text).toContain('Online');
  });

  it.each([
    [
      { keep: 1, removed: [1, 2] },
      { keep: 1, added: true },
    ],
    [
      [1, 2, 2, 3],
      [1, 2, 3],
    ],
    [null, { value: null }],
    [
      { rows: [{ value: 1 }, { value: 1 }] },
      { rows: [{ value: 2 }, { value: 1 }, { value: 1 }] },
    ],
  ])(
    'preserves both complete documents across additions, deletions and repeated lines',
    (local, online) => {
      const result = compareJson(local, online);
      expect(JSON.parse(result.localText)).toEqual(local);
      expect(JSON.parse(result.onlineText)).toEqual(online);
      expect(
        result.rows
          .flatMap((row) => (row.local ? [row.local.text] : []))
          .join('\n'),
      ).toBe(result.localText);
      expect(
        result.rows
          .flatMap((row) => (row.online ? [row.online.text] : []))
          .join('\n'),
      ).toBe(result.onlineText);
      for (const block of result.blocks) {
        expect(
          result.rows
            .slice(block.start, block.end + 1)
            .every((row) => row.block === block.id),
        ).toBe(true);
      }
    },
  );

  it('tokenizes escaped strings, numbers and literals without changing displayed text', () => {
    const value = {
      escaped: 'quote " and slash \\',
      number: -12.5,
      enabled: true,
      empty: null,
    };
    const result = compareJson(value, value);
    const tokens = result.rows.flatMap((row) => row.local?.tokens ?? []);
    expect(new Set(tokens.map((token) => token.kind))).toEqual(
      new Set(['plain', 'key', 'string', 'number', 'literal']),
    );
    for (const row of result.rows)
      expect(row.local?.tokens.map((token) => token.text).join('')).toBe(
        row.local?.text,
      );
  });

  it('keeps large replacements complete when the bounded repeated-line search falls back', () => {
    const local = Array.from({ length: 300 }, () => 1);
    const online = Array.from({ length: 300 }, () => 2);
    const result = compareJson(local, online);
    expect(JSON.parse(result.localText)).toEqual(local);
    expect(JSON.parse(result.onlineText)).toEqual(online);
    expect(result.rows.filter((row) => row.local)).toHaveLength(302);
    expect(result.rows.filter((row) => row.online)).toHaveLength(302);
    expect(result.blocks.length).toBeGreaterThan(0);
  });
});

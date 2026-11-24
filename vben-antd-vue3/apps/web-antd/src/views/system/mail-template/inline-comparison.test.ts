import { describe, expect, it } from 'vitest';

import { compareCharacters, foldSegment } from './inline-comparison';

describe('inline source comparison', () => {
  it('isolates a one-character attribute insertion beside a large embedded image', () => {
    const image = `<img src="data:image/png;base64,${'A'.repeat(100_000)}">`;
    const result = compareCharacters(
      `<table cellspacing="0">${image}`,
      `<table cellspacing="02">${image}`,
    );
    expect(result.before.filter((part) => part.changed)).toEqual([]);
    expect(result.after.filter((part) => part.changed)).toEqual([
      expect.objectContaining({ text: '2', changed: true }),
    ]);
    expect(result.after.some((part) => foldSegment(part))).toBe(true);
  });
  it('keeps distant small edits separate across a large equal payload', () => {
    const payload = 'A'.repeat(100_000);
    const before = `<table cellspacing="0"><img src="${payload}">Old</table>`;
    const after = `<table cellspacing="02"><img src="${payload}">New</table>`;
    const result = compareCharacters(before, after);
    expect(
      result.before
        .filter((part) => part.changed)
        .map((part) => part.text)
        .join(''),
    ).toBe('Old');
    expect(
      result.after
        .filter((part) => part.changed)
        .map((part) => part.text)
        .join(''),
    ).toBe('2New');
    expect(result.before.map((part) => part.text).join('')).toBe(before);
    expect(result.after.map((part) => part.text).join('')).toBe(after);
    const equalBefore = result.before.filter((part) => !part.changed);
    const equalAfter = result.after.filter((part) => !part.changed);
    expect(equalBefore).toEqual(equalAfter);
    expect(equalBefore.some((part) => foldSegment(part))).toBe(true);
  });
  it('separates multiple changes without highlighting the equal text between them', () => {
    const result = compareCharacters(
      '<p size="12">旧🙂标题</p>',
      '<p size="14">新🙃标题</p>',
    );
    expect(
      result.before.filter((part) => part.changed).map((part) => part.text),
    ).toEqual(['2', '旧🙂']);
    expect(
      result.after.filter((part) => part.changed).map((part) => part.text),
    ).toEqual(['4', '新🙃']);
  });
  it.each([
    ['', 'added'],
    ['deleted', ''],
    ['same', 'same'],
    ['a b', 'ab'],
    ['abc'.repeat(1000), 'xyz'.repeat(1000)],
  ])('preserves exact source for %s', (before, after) => {
    const result = compareCharacters(before, after);
    expect(result.before.map((part) => part.text).join('')).toBe(before);
    expect(result.after.map((part) => part.text).join('')).toBe(after);
  });
  it('never folds a changed segment or splits Unicode characters at fold edges', () => {
    expect(
      foldSegment({ text: 'a'.repeat(1000), changed: true }),
    ).toBeUndefined();
    expect(foldSegment({ text: '🙂'.repeat(300), changed: false })).toEqual({
      prefix: '🙂'.repeat(60),
      suffix: '🙂'.repeat(60),
      count: 180,
    });
  });
});

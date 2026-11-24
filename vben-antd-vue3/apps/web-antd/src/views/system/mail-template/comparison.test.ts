import type { MailTemplate, MailVersion } from '#/api/mail-template';

import { describe, expect, it } from 'vitest';

import {
  compareLines,
  hasTemplateDifferences,
  templateDifferences,
} from './comparison';
import { emptyContent } from './content';
const draft = (): MailTemplate => ({
  id: 1,
  template_id: 'test.mail',
  name: 'Mail',
  category: 'notification',
  revision: 2,
  created_at: 1,
  updated_at: 2,
  published_version: 1,
  has_draft: true,
  content: emptyContent(),
});
const version = (value: MailTemplate): MailVersion => ({
  id: 1,
  version: 1,
  name: value.name,
  category: value.category,
  content: structuredClone(value.content),
  created_at: 1,
  published_by: 1,
});

describe('email template comparison', () => {
  it('aligns insertions and deletions without marking following lines as changed', () => {
    const result = compareLines(
      'header\nold\nkeep\nfooter',
      'header\nkeep\nnew\nfooter',
    );
    expect(
      result.filter((row) => !row.changed).map((row) => row.before?.text),
    ).toEqual(['header', 'keep', 'footer']);
    expect(result.filter((row) => row.changed)).toEqual([
      { before: { number: 2, text: 'old' }, after: undefined, changed: true },
      { before: undefined, after: { number: 3, text: 'new' }, changed: true },
    ]);
  });
  it('preserves blank lines, repeated lines and both sides of replacements', () => {
    const before = 'a\n\nb\na\n';
    const after = 'a\nx\nb\na\n';
    const result = compareLines(before, after);
    expect(
      result
        .filter((row) => row.before)
        .map((row) => row.before?.text)
        .join('\n'),
    ).toBe(before);
    expect(
      result
        .filter((row) => row.after)
        .map((row) => row.after?.text)
        .join('\n'),
    ).toBe(after);
    expect(result.filter((row) => row.changed)).toHaveLength(1);
  });
  it('bounds large replacements while retaining every line', () => {
    const before = Array.from({ length: 600 }, (_, i) => `old${i}`).join('\n');
    const after = Array.from({ length: 600 }, (_, i) => `new${i}`).join('\n');
    const result = compareLines(before, after);
    expect(result).toHaveLength(600);
    expect(
      result
        .filter((row) => row.before)
        .map((row) => row.before?.text)
        .join('\n'),
    ).toBe(before);
    expect(
      result
        .filter((row) => row.after)
        .map((row) => row.after?.text)
        .join('\n'),
    ).toBe(after);
  });
  it('detects changes in both languages and metadata but ignores preview-key order', () => {
    const value = draft();
    value.content['zh-CN'].preview_values = { b: '2', a: '1' };
    const published = version(value);
    expect(hasTemplateDifferences(value, published)).toBe(false);
    value.template_id = 'renamed.template';
    value.revision++;
    value.content['zh-CN'].preview_values = { a: '1', b: '2' };
    expect(hasTemplateDifferences(value, published)).toBe(false);
    value.name = 'Changed';
    expect(hasTemplateDifferences(value, published)).toBe(true);
    value.content['zh-CN'].subject = '新主题';
    value.content['en-US'].text = 'New text';
    value.content['zh-CN'].preview_values = { a: '1', b: '2' };
    expect(
      templateDifferences(value, published).map((field) => field.key),
    ).toEqual(['name', 'zh-CN.subject', 'en-US.text']);
    value.content['en-US'].preview_values = { code: '123456' };
    expect(templateDifferences(value, published).at(-1)?.key).toBe(
      'en-US.preview_values',
    );
  });
  it('represents a first publication as additions and returns no differences for identical content', () => {
    const value = draft();
    value.content['en-US'].html = '<p>{{code}}</p>';
    expect(templateDifferences(value, version(value))).toEqual([]);
    expect(hasTemplateDifferences(value, version(value))).toBe(false);
    const first = templateDifferences(value);
    expect(first.map((field) => field.key)).toEqual([
      'name',
      'category',
      'en-US.html',
    ]);
    expect(
      first.every((field) =>
        field.rows.every((row) => row.changed && !row.before),
      ),
    ).toBe(true);
  });
});

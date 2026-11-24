import { describe, expect, it } from 'vitest';

import {
  cleanContent,
  correspondingRange,
  emptyContent,
  parameterMatches,
  parameterNames,
  previewDocument,
  renderSubject,
} from './content';

describe('email template content', () => {
  it('creates independent empty languages without default parameters', () => {
    const content = emptyContent();
    content['zh-CN'].preview_values.code = '123456';
    expect(content['en-US'].preview_values).toEqual({});
    expect(content['zh-CN'].html).toBe('');
  });
  it('finds exact selection ranges and deduplicates repeated placeholders', () => {
    const source = '<p>{{code}}</p>\n{{ code }} {{account}}';
    expect(parameterNames(source)).toEqual(['code', 'account']);
    expect(
      parameterMatches(source).map((value) =>
        source.slice(value.start, value.end),
      ),
    ).toEqual(['{{code}}', '{{ code }}', '{{account}}']);
  });
  it('renders one language and escapes values without inventing missing examples', () => {
    const content = emptyContent();
    content['zh-CN'] = {
      subject: '验证码 {{code}}',
      html: '<p>{{code}} / {{unknown}}</p>',
      text: 'plain',
      preview_values: { code: '<img src=x onerror=alert(1)>' },
    };
    content['en-US'].html = '<p>English only</p>';
    const document = previewDocument(content['zh-CN'], 'zh-CN');
    expect(document).toContain('&lt;img');
    expect(document).toContain('{{unknown}}');
    expect(document).not.toContain('English only');
    expect(document).not.toContain('>plain<');
    expect(renderSubject(content['zh-CN'])).toContain('<img');
  });
  it('isolates preview HTML from scripts, navigation and network resources', () => {
    const item = emptyContent()['zh-CN'];
    item.html =
      '<script>alert(1)</script><iframe src="https://example.test"></iframe><a href="javascript:alert(1)" onclick="alert(1)">Link</a><img src="https://example.test/pixel"><style>p{color:red}</style><p>Safe</p>';
    const result = previewDocument(item, 'zh-CN');
    expect(result).not.toMatch(
      /<script|<iframe|onclick|javascript:|src="https/,
    );
    expect(result).toContain("default-src 'none'");
    expect(result).toContain('<p>Safe</p>');
  });
  it('retains examples referenced by subject or text and prunes deleted parameters per language', () => {
    const content = emptyContent();
    content['zh-CN'].subject = '{{subject_value}}';
    content['zh-CN'].text = '{{plain_value}}';
    content['zh-CN'].preview_values = {
      subject_value: 'a',
      plain_value: 'b',
      removed: 'c',
    };
    const cleaned = cleanContent(content);
    expect(cleaned['zh-CN'].preview_values).toEqual({
      subject_value: 'a',
      plain_value: 'b',
    });
    expect(content['zh-CN'].preview_values.removed).toBe('c');
  });
  it('renders embedded logo images while blocking remote and SVG sources', () => {
    const item = emptyContent()['zh-CN'];
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    item.html = `<img src="${png}" alt="Brand" width="36" height="36"><img src="data:image/svg+xml;base64,PHN2Zz4=" alt="svg"><img src="https://example.test/logo.png" alt="remote"><div src="${png}">Text</div>`;
    const result = previewDocument(item, 'zh-CN');
    expect(result).toContain(
      `<img src="${png}" alt="Brand" width="36" height="36">`,
    );
    expect(result).not.toContain('data:image/svg+xml');
    expect(result).not.toContain('https://example.test');
    expect(result).toContain('<div>Text</div>');
    expect(result).toContain('img-src data:');
  });
  it('opens only absolute HTTP links in an isolated new tab', () => {
    const item = emptyContent()['zh-CN'];
    item.html =
      '<a href="{{action_url}}" target="_top" ping="https://tracking.test" download>Confirm</a><a href="data:text/html,bad">Bad</a><a href="/relative">Relative</a><a href="https://user:password@example.test">Credentials</a>';
    item.preview_values.action_url =
      'https://example.test/confirm#token=preview';
    const holder = document.createElement('template');
    holder.innerHTML = previewDocument(item, 'zh-CN');
    const links = [...holder.content.querySelectorAll('a')];
    expect(links[0]?.getAttribute('href')).toBe(item.preview_values.action_url);
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0]?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(links[0]?.hasAttribute('ping')).toBe(false);
    expect(links[0]?.hasAttribute('download')).toBe(false);
    expect(links.slice(1).every((link) => !link.hasAttribute('href'))).toBe(
      true,
    );
  });
});

describe('bilingual parameter insertion positions', () => {
  it('maps translated text boundaries without using the same byte offset', () => {
    const zh = '<p>欢迎回来</p><p>验证码：</p>';
    const en = '<p>Welcome back</p><p>Code: </p>';
    const start = zh.lastIndexOf('</p>');
    expect(correspondingRange(zh, en, start, start)).toEqual({
      start: en.lastIndexOf('</p>'),
      end: en.lastIndexOf('</p>'),
    });
  });
  it('replaces localized sample selections and attributes', () => {
    expect(
      correspondingRange(
        '<p>您好张三</p>',
        '<p>Hello Alice</p>',
        5,
        7,
        '张三',
        'Alice',
      ),
    ).toEqual({ start: 9, end: 14 });
    const a = '<a title="中文" href="https://a.test">链接</a>';
    const b = '<a href="https://b.test" title="English">Link</a>';
    const start = a.indexOf('https');
    expect(correspondingRange(a, b, start, start + 14)).toEqual({
      start: b.indexOf('https'),
      end: b.indexOf('https') + 14,
    });
  });
  it('fails atomically when structures or translated mid-text positions are ambiguous', () => {
    expect(
      correspondingRange('<p>中文</p>', '<div>English</div>', 5, 5),
    ).toBeUndefined();
    expect(
      correspondingRange('<p>中文</p>', '<p>English</p>', 4, 4),
    ).toBeUndefined();
  });
});

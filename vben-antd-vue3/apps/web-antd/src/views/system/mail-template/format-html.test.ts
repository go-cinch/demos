import { describe, expect, it } from 'vitest';

import { formatMailHTML } from './format-html';

describe('mail HTML formatting', () => {
  it('produces readable block indentation and repairs the previous split-bracket layout', async () => {
    const source =
      '<div\n  ><p>账号 {{account}}</p\n  ><div data-section="safety-footer"\n    ><h2>如非本人操作</h2\n    ><p>请联系管理员。</p\n  ></div\n></div\n>';
    expect(await formatMailHTML(source)).toBe(
      [
        '<div>',
        '  <p>账号 {{account}}</p>',
        '  <div data-section="safety-footer">',
        '    <h2>如非本人操作</h2>',
        '    <p>请联系管理员。</p>',
        '  </div>',
        '</div>',
        '',
      ].join('\n'),
    );
  });

  it('formats nested email markup without losing placeholders, links or embedded images', async () => {
    const source =
      '<table role="presentation"><tr><td style="padding:32px"><img src="data:image/png;base64,AAAA" alt="Logo"><p>账号 <strong>{{account}}</strong>。</p><a target="_blank" rel="noopener noreferrer" href="{{audit_url}}">查看日志</a></td></tr></table>';
    const formatted = await formatMailHTML(source);
    expect(formatted.split('\n').length).toBeGreaterThan(4);
    const before = document.createElement('template');
    const after = document.createElement('template');
    before.innerHTML = source;
    after.innerHTML = formatted;
    expect(after.content.querySelector('p')?.textContent).toBe(
      before.content.querySelector('p')?.textContent,
    );
    for (const selector of ['a', 'img', 'td']) {
      expect(
        after.content
          .querySelector(selector)
          ?.getAttributeNames()
          .map((name) => [
            name,
            after.content.querySelector(selector)?.getAttribute(name),
          ]),
      ).toEqual(
        before.content
          .querySelector(selector)
          ?.getAttributeNames()
          .map((name) => [
            name,
            before.content.querySelector(selector)?.getAttribute(name),
          ]),
      );
    }
    expect(await formatMailHTML(formatted)).toBe(formatted);
  });

  it('keeps long email attributes readable and repeated formatting stable', async () => {
    const source =
      '<div style="padding:17px 12px 19px;background:#eff6ff;border-radius:8px;text-align:center;margin-top:22px"><div style="font-family:Arial,sans-serif;font-size:36px;letter-spacing:9px;padding-left:9px;color:#1d4ed8;font-weight:700;line-height:1.35">{{code}}</div></div>';
    const formatted = await formatMailHTML(source);
    expect(formatted).not.toMatch(/^\s*>/m);
    expect(formatted).not.toMatch(/<\/\w+\s*\n/);
    expect(await formatMailHTML(formatted)).toBe(formatted);
  });

  it('preserves adjacent inline text and preformatted whitespace', async () => {
    const source =
      '<div><span>A</span><span>B</span><pre>  code\n    {{code}}\n</pre></div>';
    const formatted = await formatMailHTML(source);
    const holder = document.createElement('template');
    holder.innerHTML = formatted;
    expect(holder.content.querySelector('span')?.nextSibling?.nodeName).toBe(
      'SPAN',
    );
    expect(holder.content.querySelector('pre')?.textContent).toBe(
      '  code\n    {{code}}\n',
    );
  });

  it('keeps multiline template values inside an inline span across repeated formatting', async () => {
    const source =
      '<div style="font-size:18px;line-height:1.75;color:#78350f;font-weight:700"><span style="white-space:pre-line">{{activity_summary}}</span></div>';
    const formatted = await formatMailHTML(source);
    expect(await formatMailHTML(formatted)).toBe(formatted);
    const holder = document.createElement('template');
    holder.innerHTML = formatted;
    expect(holder.content.querySelector('span')?.textContent).toBe(
      '{{activity_summary}}',
    );
    expect(holder.content.querySelector('div')?.style.whiteSpace).toBe('');
    for (const summary of [
      '创建：3 次\n删除：2 次\n修改：4 次',
      'Created: 3\nDeleted: 2\nUpdated: 4',
    ]) {
      holder.innerHTML = formatted.replace('{{activity_summary}}', summary);
      expect(holder.content.querySelector('span')?.textContent).toBe(summary);
      expect(holder.content.querySelector('span')?.style.whiteSpace).toBe(
        'pre-line',
      );
    }
  });

  it('leaves empty content alone and does not invent tags in incomplete drafts', async () => {
    expect(await formatMailHTML('  ')).toBe('  ');
    const incomplete = '<div><span>broken</div>';
    const formatted = await formatMailHTML(incomplete);
    expect(formatted.replaceAll(/\s/g, '')).toBe(incomplete);
  });
});

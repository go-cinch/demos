import type {
  MailContent,
  MailLocale,
  MailTranslation,
} from '#/api/mail-template';

import { requiredEntry } from '#/utils/required-entry';

export const mailLocales: MailLocale[] = ['zh-CN', 'en-US'];
export const templateIDPattern = /^[a-z][a-z0-9_.-]{0,99}$/;
export const parameterNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export function emptyContent(): MailContent {
  const translation = (): MailTranslation => ({
    subject: '',
    html: '',
    text: '',
    preview_values: {},
  });
  return { 'zh-CN': translation(), 'en-US': translation() };
}
export function parameterMatches(source: string) {
  return [
    ...source.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g),
  ].flatMap((match) => {
    const name = match[1];
    const start = match.index;
    return name === undefined || start === undefined
      ? []
      : [{ name, start, end: start + match[0].length }];
  });
}
export function parameterNames(source: string) {
  return [...new Set(parameterMatches(source).map((match) => match.name))];
}
export function cleanContent(content: MailContent): MailContent {
  const result: MailContent = JSON.parse(JSON.stringify(content));
  for (const locale of mailLocales) {
    const item = result[locale];
    const names = new Set(
      parameterNames(`${item.subject}\n${item.html}\n${item.text}`),
    );
    item.preview_values = Object.fromEntries(
      Object.entries(item.preview_values ?? {}).filter(([key]) =>
        names.has(key),
      ),
    );
  }
  return result;
}
export function escapeHTML(value: string) {
  return value.replaceAll(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  );
}
export function renderSubject(item: MailTranslation) {
  return item.subject.replaceAll(
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (full, key: string) => item.preview_values?.[key] ?? full,
  );
}
// Preview links open in a separate tab; scripts, forms and remote resources stay blocked.
// Delivery integration must implement its own server-side rendering contract.
export function previewDocument(item: MailTranslation, locale: MailLocale) {
  const source = item.html.replaceAll(
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (full, key: string) => escapeHTML(item.preview_values?.[key] ?? full),
  );
  const holder = document.createElement('template');
  holder.innerHTML = source;
  holder.content
    .querySelectorAll(
      'script,iframe,object,embed,form,input,button,textarea,select,link,meta,base,svg,math,video,audio',
    )
    .forEach((element) => element.remove());
  holder.content.querySelectorAll('*').forEach((element) => {
    const href = element.tagName === 'A' ? element.getAttribute('href') : null;
    let safeLink: string | undefined;
    if (href) {
      try {
        const url = new URL(href);
        if (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        )
          safeLink = url.href;
      } catch {
        /* Incomplete draft URLs stay non-navigable. */
      }
    }
    for (const attribute of [...element.attributes]) {
      // Embedded raster images render without network access. Keep remote and
      // SVG sources blocked, as well as src attributes on non-image elements.
      if (
        element.tagName === 'IMG' &&
        attribute.name === 'src' &&
        /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+={0,2}$/i.test(
          attribute.value,
        )
      ) {
        continue;
      }
      if (
        /^on/i.test(attribute.name) ||
        [
          'action',
          'download',
          'formaction',
          'href',
          'ping',
          'src',
          'srcdoc',
          'srcset',
          'target',
        ].includes(attribute.name)
      )
        element.removeAttribute(attribute.name);
    }
    if (safeLink) {
      element.setAttribute('href', safeLink);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
      element.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{margin:0;overflow-wrap:anywhere}table,img{max-width:100%}</style></head><body>${holder.innerHTML}</body></html>`;
}

// Locate the same source slot without serializing HTML (which would rewrite code).
// Text and attribute values are matched separately, so translated string lengths
// cannot move a parameter into a tag or a different attribute.
export function correspondingRange(
  source: string,
  target: string,
  start: number,
  end: number,
  sourceSample = '',
  targetSample = '',
): undefined | { start: number; end: number } {
  if (source === target) return { start, end };
  if (start === 0 && end === 0) return { start: 0, end: 0 };
  if (start === source.length && end === source.length)
    return { start: target.length, end: target.length };
  const chunks = (html: string) => [
    ...html.matchAll(
      /<!--[^]*?-->|<[^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>|[^<]+/g,
    ),
  ];
  const left = chunks(source);
  const right = chunks(target);
  const contains = (part: (typeof left)[number]) =>
    start >= part.index && end <= part.index + part[0].length;
  const textIndex = left.findIndex(
    (part) => !part[0].startsWith('<') && contains(part),
  );
  const index =
    textIndex === -1 ? left.findIndex((item) => contains(item)) : textIndex;
  const a = left[index];
  const b = right[index];
  if (!a || !b) return undefined;
  const signature = (value: string) =>
    value.startsWith('<')
      ? (value.match(/^<\/?[\w-]+/)?.[0].toLowerCase() ?? value)
      : '#text';
  if (
    left
      .slice(0, index + 1)
      .some(
        (part, i) =>
          signature(part[0]) !== signature(right[i]?.[0] ?? '<missing>'),
      )
  )
    return undefined;
  const mapText = (
    aText: string,
    bText: string,
    offset: number,
    finish: number,
  ) => {
    if (aText === bText) return { start: offset, end: finish };
    if (offset === 0 && finish === aText.length)
      return { start: 0, end: bText.length };
    if (
      sourceSample &&
      targetSample &&
      aText.slice(offset, finish) === sourceSample
    ) {
      const at = bText.indexOf(targetSample);
      if (at !== -1 && !bText.includes(targetSample, at + 1))
        return { start: at, end: at + targetSample.length };
    }
    const point = (at: number) => {
      if (at === 0) return 0;
      if (at === aText.length) return bText.length;
      const prefix = aText.slice(0, at);
      const suffix = aText.slice(at);
      if (bText.startsWith(prefix)) return at;
      if (bText.endsWith(suffix)) return bText.length - suffix.length;
      return undefined;
    };
    const e = point(finish);
    const s = point(offset);
    return s !== undefined && e !== undefined && s <= e
      ? { start: s, end: e }
      : undefined;
  };
  let baseA = a.index;
  let baseB = b.index;
  let textA = a[0];
  let textB = b[0];
  if (textA.startsWith('<')) {
    const attributes = (tag: string) =>
      [...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => ({
        name: requiredEntry(match[1], 'template capture group'),
        text: requiredEntry(match[3], 'template capture group'),
        start:
          match.index +
          match[0].indexOf(requiredEntry(match[2], 'template capture group')) +
          1,
      }));
    const attr = attributes(textA).find(
      (value) =>
        start >= baseA + value.start &&
        end <= baseA + value.start + value.text.length,
    );
    const other =
      attr && attributes(textB).find((value) => value.name === attr.name);
    if (!attr || !other) return undefined;
    baseA += attr.start;
    baseB += other.start;
    textA = attr.text;
    textB = other.text;
  }
  const range = mapText(textA, textB, start - baseA, end - baseA);
  return range && { start: baseB + range.start, end: baseB + range.end };
}

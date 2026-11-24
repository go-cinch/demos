/** Use conventional HTML indentation without splitting tag brackets onto text lines. */
export async function formatMailHTML(source: string): Promise<string> {
  if (!source.trim()) return source;
  const { default: beautify } = await import('js-beautify');
  const options = {
    indent_size: 2,
    indent_char: ' ',
    indent_with_tabs: false,
    wrap_line_length: 100,
    wrap_attributes: 'auto' as const,
    preserve_newlines: false,
    extra_liners: [],
    content_unformatted: ['pre', 'textarea', 'script', 'style'],
    end_with_newline: true,
    eol: '\n',
  };
  // A second pass settles closing-tag indentation after long attributes wrap.
  return beautify.html(beautify.html(source, options), options);
}

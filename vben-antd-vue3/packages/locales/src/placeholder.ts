/** Simplify hints at render time, including translations from a live catalog. */
export function normalizePlaceholder(value: string): string {
  const chinese = value
    .replace(/^(?:请再次输入|再次输入)(.+)$/, '$1（确认）')
    .replace(/^(?:请输入|输入|请选择|选择)\s*(?:一个)?/, '');
  if (chinese !== value) return chinese;

  const english = value.replace(
    /^(?:please\s+)?(?:enter|input|select|choose)(?:\s+|$)(?:(?:your|the|an?)\s+)?/i,
    '',
  );
  if (english === value) return value;
  return english
    .replace(/^(.+)\s+again$/i, '$1 (confirmation)')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

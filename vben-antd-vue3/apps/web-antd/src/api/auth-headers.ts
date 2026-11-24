export function responseHeader(
  headers: unknown,
  name: string,
): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const source = headers as Record<string, unknown> & {
    get?: (key: string) => unknown;
  };
  const value =
    typeof source.get === 'function'
      ? source.get(name)
      : Object.entries(source).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        )?.[1];
  return typeof value === 'string' ? value : undefined;
}

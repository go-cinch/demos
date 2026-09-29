export const trimCredential = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
export const nonempty = (value: unknown): boolean => trimCredential(value).length > 0;
export const dictionaryKeyValid = (value: string) => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value);

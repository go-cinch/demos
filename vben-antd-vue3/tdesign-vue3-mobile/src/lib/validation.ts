export const nonempty = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;
export const dictionaryKeyValid = (value: string) => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value);

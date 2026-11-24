/** Read an entry whose presence is an invariant of the current operation. */
export function requiredEntry<T>(
  value: null | T | undefined,
  description: string,
): T {
  if (value === undefined || value === null)
    throw new Error(`Missing ${description}`);
  return value;
}

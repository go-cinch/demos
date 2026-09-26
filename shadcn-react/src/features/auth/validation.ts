export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

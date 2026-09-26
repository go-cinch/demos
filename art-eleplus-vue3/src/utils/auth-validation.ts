/** Shared credential constraints. Keep these aligned with the reference admin. */
export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidUserPassword(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidUsername(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidUserPassword(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

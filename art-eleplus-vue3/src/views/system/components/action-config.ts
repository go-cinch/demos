export const actionWordPattern =
  /^[a-z][a-z0-9_-]*:(?:read|create|update|delete|all|default|grant):[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)+$/

export const actionGroupPattern = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){2,}$/
export function isValidActionGroup(word: string, scope?: string) {
  return (
    word.length <= 128 && actionGroupPattern.test(word) && (!scope || word.startsWith(`${scope}:`))
  )
}

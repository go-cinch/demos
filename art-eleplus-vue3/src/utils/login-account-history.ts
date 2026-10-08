const HISTORY_LIMIT = 10

function storageKey() {
  return `LOGIN_ACCOUNT_HISTORY_${window.location.hostname}`
}

export function clearLegacyLoginCredentials() {
  try {
    localStorage.removeItem(`art-auth-remember:${window.location.hostname}`)
    localStorage.removeItem('art-auth-remember')
  } catch {
    // Browsers may disable storage. Authentication must still work.
  }
}

function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, HISTORY_LIMIT)
}

export function readLoginAccountHistory(): string[] {
  clearLegacyLoginCredentials()
  try {
    const stored = localStorage.getItem(storageKey())
    const history = normalizeHistory(JSON.parse(stored || '[]'))
    if (stored && stored !== JSON.stringify(history)) saveHistory(history)
    return history
  } catch {
    return saveHistory([])
  }
}

function saveHistory(accounts: string[]) {
  const history = normalizeHistory(accounts)
  try {
    if (history.length) localStorage.setItem(storageKey(), JSON.stringify(history))
    else localStorage.removeItem(storageKey())
  } catch {
    // History is optional and must not turn a successful login into a failure.
  }
  return history
}

export function recordLoginAccount(username: string) {
  const account = username.trim()
  const history = readLoginAccountHistory()
  return account ? saveHistory([account, ...history]) : history
}

export function removeLoginAccount(username: string) {
  return saveHistory(readLoginAccountHistory().filter((account) => account !== username))
}

export function clearLoginAccountHistory() {
  return saveHistory([])
}

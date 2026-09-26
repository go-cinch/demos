export interface RememberedCredentials {
  password: string
  username: string
}

function storageKey() {
  return `art-auth-remember:${window.location.hostname}`
}

export function readRememberedCredentials(): RememberedCredentials | null {
  try {
    const current = JSON.parse(
      localStorage.getItem(storageKey()) || 'null'
    ) as Partial<RememberedCredentials> | null
    if (typeof current?.username === 'string') {
      return {
        username: current.username,
        password: typeof current.password === 'string' ? current.password : ''
      }
    }
    const legacy = JSON.parse(
      localStorage.getItem('art-auth-remember') || 'null'
    ) as Partial<RememberedCredentials> | null
    localStorage.removeItem('art-auth-remember')
    if (typeof legacy?.username === 'string') {
      const migrated = {
        username: legacy.username,
        password: typeof legacy.password === 'string' ? legacy.password : ''
      }
      saveRememberedCredentials(migrated)
      return migrated
    }
  } catch {
    localStorage.removeItem(storageKey())
    localStorage.removeItem('art-auth-remember')
  }
  return null
}

export function saveRememberedCredentials(credentials: RememberedCredentials) {
  localStorage.setItem(storageKey(), JSON.stringify(credentials))
}

export function clearRememberedCredentials() {
  localStorage.removeItem(storageKey())
  localStorage.removeItem('art-auth-remember')
}

export function updateRememberedPassword(password: string) {
  const current = readRememberedCredentials()
  if (current) saveRememberedCredentials({ ...current, password })
}

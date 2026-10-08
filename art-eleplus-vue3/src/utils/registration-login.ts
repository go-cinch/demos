interface RegistrationLoginCredentials {
  username: string
  password: string
}

// Only the next login view can read these credentials. A reload discards them.
let pendingRegistrationLogin: RegistrationLoginCredentials | undefined

export function stageRegistrationLogin(credentials: RegistrationLoginCredentials) {
  pendingRegistrationLogin = {
    username: credentials.username.trim(),
    password: credentials.password
  }
}

export function consumeRegistrationLogin() {
  const credentials = pendingRegistrationLogin
  pendingRegistrationLogin = undefined
  return credentials
}

export function clearRegistrationLogin() {
  pendingRegistrationLogin = undefined
}

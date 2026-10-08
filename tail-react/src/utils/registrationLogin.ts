interface RegistrationLogin {
  username: string;
  password: string;
}

// Only bridge the successful registration redirect. Never write this to storage
// or router state; a document reload must start with an empty password.
let pendingRegistrationLogin: RegistrationLogin | null = null;

export function stageRegistrationLogin(credentials: RegistrationLogin): void {
  const username = credentials.username.trim();
  const password = credentials.password;
  pendingRegistrationLogin = username && password.trim() ? { username, password } : null;
}

export function consumeRegistrationLogin(): RegistrationLogin | null {
  const credentials = pendingRegistrationLogin;
  pendingRegistrationLogin = null;
  return credentials;
}

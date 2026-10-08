interface RegistrationLogin {
  username: string;
  password: string;
}

// Only the immediate registration-to-login transition may reuse a password.
// This module has no browser-storage or router-state dependency.
let pendingLogin: RegistrationLogin | undefined;

export function setRegistrationLogin(username: string, password: string) {
  pendingLogin = { username, password };
}

export function consumeRegistrationLogin() {
  const credentials = pendingLogin;
  pendingLogin = undefined;
  return credentials;
}

'use client';

import * as React from 'react';
import {
  clearSession,
  getUserInfo,
  logout as apiLogout,
  restoreSession,
  type UserInfo
} from './api';

interface AuthValue {
  loading: boolean;
  passwordResetRequired: boolean;
  user: UserInfo | null;
  reload: () => Promise<UserInfo>;
  setPasswordResetRequired: (value: boolean) => void;
  signOut: (preserveRedirect?: boolean) => Promise<void>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState<UserInfo | null>(null);
  const [passwordResetRequired, setPasswordResetRequired] = React.useState(false);
  const reload = React.useCallback(async () => {
    const next = await getUserInfo();
    setUser(next);
    return next;
  }, []);
  React.useEffect(() => {
    restoreSession()
      .then((session) => {
        setPasswordResetRequired(session.password_reset_required);
        if (!session.password_reset_required) return reload();
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [reload]);
  React.useEffect(() => {
    const requireReset = () => setPasswordResetRequired(true);
    const expireSession = () => {
      setUser(null);
      setPasswordResetRequired(false);
    };
    window.addEventListener('go-cinch-password-reset-required', requireReset);
    window.addEventListener('go-cinch-session-expired', expireSession);
    return () => {
      window.removeEventListener('go-cinch-password-reset-required', requireReset);
      window.removeEventListener('go-cinch-session-expired', expireSession);
    };
  }, []);
  const signOut = React.useCallback(async (preserveRedirect = true) => {
    const redirect = `${window.location.pathname}${window.location.search}`;
    await apiLogout();
    setUser(null);
    window.location.href = preserveRedirect
      ? `/auth/login?redirect=${encodeURIComponent(redirect)}`
      : '/auth/login';
  }, []);
  return (
    <AuthContext.Provider
      value={{ loading, passwordResetRequired, user, reload, setPasswordResetRequired, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function resolveHomePath(user: UserInfo) {
  void user;
  return '/dashboard/overview';
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

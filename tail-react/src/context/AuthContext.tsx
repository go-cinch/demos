import {
  getUserInfo,
  login,
  logout as logoutApi,
  type CaptchaPoint,
  type UserInfo,
} from "@/api/auth";
import {
  clearSession,
  getRefreshToken,
  refreshSession,
  type LoginResult,
} from "@/api/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface LoginValues {
  captcha_id?: string;
  captcha_points?: CaptchaPoint[];
  password: string;
  remember_me: boolean;
  slider_proof: string;
  username: string;
}

interface AuthContextValue {
  loading: boolean;
  passwordResetRequired: boolean;
  user: UserInfo | null;
  canButton: (code: string) => boolean;
  canMenu: (path: string) => boolean;
  completeReset: () => Promise<UserInfo>;
  login: (values: LoginValues) => Promise<LoginResult & { homePath?: string }>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<UserInfo>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function resolveHomePath(info: UserInfo) {
  void info;
  return "/dashboard/overview";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);

  const reloadUser = useCallback(async () => {
    const info = await getUserInfo();
    setUser(info);
    return info;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!getRefreshToken()) return;
      try {
        const session = await refreshSession();
        if (!active) return;
        setPasswordResetRequired(session.password_reset_required);
        if (!session.password_reset_required) await reloadUser();
      } catch {
        clearSession();
      }
    })().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloadUser]);

  const signIn = useCallback(
    async (values: LoginValues) => {
      const result = await login(values);
      setPasswordResetRequired(result.password_reset_required);
      const info = result.password_reset_required
        ? undefined
        : await reloadUser();
      return { ...result, homePath: info ? resolveHomePath(info) : undefined };
    },
    [reloadUser],
  );

  const signOut = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setPasswordResetRequired(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user,
      passwordResetRequired,
      canButton: (code) =>
        Boolean(
          user?.permission.btns.includes("*") ||
          user?.permission.btns.includes(code),
        ),
      canMenu: (path) =>
        path === "/dashboard/overview" ||
        Boolean(
          user?.permission.menus.includes("*") ||
          user?.permission.menus.includes(path),
        ),
      completeReset: async () => {
        setPasswordResetRequired(false);
        return reloadUser();
      },
      login: signIn,
      logout: signOut,
      reloadUser,
    }),
    [loading, passwordResetRequired, reloadUser, signIn, signOut, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

import i18n from "@/i18n";

const API_BASE = import.meta.env.VITE_GLOB_AUTH_API_URL || "/api/auth";
const REFRESH_TOKEN_KEY = "tail-react-refresh-token";

let accessToken = "";
let refreshPromise: Promise<LoginResult> | null = null;

export interface LoginResult {
  access_token: string;
  expired_at: number;
  password_reset_required: boolean;
  refresh_token: string;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(String(data.msg || data.message || data.error || `HTTP ${status}`));
    this.status = status;
    this.data = data;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || "";
}

export function acceptSession(result: LoginResult) {
  accessToken = result.access_token;
  localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
}

export function clearSession() {
  accessToken = "";
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  retry?: boolean;
}

async function readBody(response: Response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  { auth = true, retry = true, headers, body, ...init }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    body,
    headers: {
      Accept: "application/json",
      "Accept-Language": i18n.language.startsWith("zh") ? "zh-CN" : "en-US",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
      ...headers,
    },
  });

  const data = await readBody(response);
  if (response.ok) return data as T;
  if (response.status === 401 && auth && retry && getRefreshToken()) {
    await refreshSession();
    return apiRequest<T>(path, { ...init, body, headers, auth, retry: false });
  }
  throw new ApiError(
    response.status,
    data && typeof data === "object" ? data : { message: String(data || "") },
  );
}

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = apiRequest<LoginResult>("/auth/pub/refresh", {
      auth: false,
      retry: false,
      method: "POST",
      body: JSON.stringify({ refresh_token: getRefreshToken() }),
    })
      .then((result) => {
        acceptSession(result);
        return result;
      })
      .catch((error) => {
        clearSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function jsonRequest<T>(
  path: string,
  method: string,
  data?: unknown,
  options?: RequestOptions,
) {
  return apiRequest<T>(path, {
    ...options,
    method,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

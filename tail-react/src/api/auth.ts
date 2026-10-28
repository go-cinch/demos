import {
  acceptSession,
  apiRequest,
  clearSession,
  getRefreshToken,
  jsonRequest,
  type LoginResult,
} from "./client";
import { compactEncrypt, type CredentialChallenge } from "./jwe";
import {
  clearLegacyLoginCredentials,
  recordLoginAccount,
} from "@/utils/loginAccountHistory";

export interface CaptchaPoint {
  x: number;
  y: number;
}

export interface PointCaptchaChallenge {
  captcha_id: string;
  captcha_image: string;
  expired_at: number;
  height: number;
  hint_text: string;
  target_count: number;
  width: number;
}

export interface PermissionNavigation { resource_key: string; menu_key?: string; menu_path?: string; children?: PermissionNavigation[] }

export interface UserInfo {
  code: string;
  id: number;
  scope?: string;
  permission: { btns: string[]; menus: string[]; permission_scope?: "*"; permission_scopes?: string[]; words?: string[]; navigation?: PermissionNavigation[] };
  role?: { id: number; name: string; word: string };
  username: string;
}

async function encryptedCredential(
  purpose: "login" | "register" | "password_change" | "password_reset",
  payload: Record<string, unknown>,
) {
  const normalized = { ...payload };
  for (const key of ["username", "password", "old_password", "new_password"]) {
    const value = normalized[key];
    if (typeof value === "string") normalized[key] = value.trim();
  }
  const authenticated =
    purpose === "password_change" || purpose === "password_reset";
  const challenge = await jsonRequest<CredentialChallenge>(
    authenticated ? "/challenge" : "/pub/challenge",
    "POST",
    { purpose },
    { auth: authenticated },
  );
  return {
    challenge_id: challenge.challenge_id,
    credential: await compactEncrypt(challenge, purpose, normalized),
  };
}

export async function login(data: {
  captcha_id?: string;
  captcha_points?: CaptchaPoint[];
  password: string;
  slider_proof: string;
  username: string;
}) {
  clearLegacyLoginCredentials();
  const credential = await encryptedCredential("login", {
    ...data,
    remember_me: false,
  });
  const result = await jsonRequest<LoginResult>(
    "/pub/login",
    "POST",
    credential,
    { auth: false },
  );
  acceptSession(result);
  recordLoginAccount(data.username);
  return result;
}

export async function register(
  username: string,
  password: string,
  sliderProof: string,
) {
  clearLegacyLoginCredentials();
  const credential = await encryptedCredential("register", {
    username,
    password,
    slider_proof: sliderProof,
  });
  return jsonRequest("/pub/register", "POST", credential, { auth: false });
}

export const usernameAvailability = (username: string) =>
  apiRequest<{ available: boolean }>(
    `/pub/register/username?username=${encodeURIComponent(username)}`,
    { auth: false },
  );

export const loginVerification = (username: string) =>
  apiRequest<{ captcha?: PointCaptchaChallenge; captcha_required: boolean }>(
    `/pub/login/verification?username=${encodeURIComponent(username)}`,
    { auth: false },
  );

export const refreshLoginCaptcha = (captchaId: string) =>
  jsonRequest<PointCaptchaChallenge>(
    "/pub/captcha",
    "POST",
    { captcha_id: captchaId },
    { auth: false },
  );

export const verifyLoginCaptcha = (
  username: string,
  captchaId: string,
  points: CaptchaPoint[],
) =>
  jsonRequest<{ captcha?: PointCaptchaChallenge; verified: boolean }>(
    "/pub/captcha/verify",
    "POST",
    { username, captcha_id: captchaId, captcha_points: points },
    { auth: false },
  );

export const createSliderChallenge = (
  purpose: "login" | "register",
  username: string,
) =>
  jsonRequest<{ captcha_id: string; expired_at: number }>(
    "/pub/slider/challenge",
    "POST",
    { purpose, username },
    { auth: false },
  );

export const verifySlider = (data: Record<string, unknown>) =>
  jsonRequest<{ proof: string }>("/pub/slider/verify", "POST", data, {
    auth: false,
  });

export async function getUserInfo() {
  interface Menu { menu_key: string; menu_path: string; btns: string[] }
  const raw = await apiRequest<Omit<UserInfo, 'permission'> & { permission: Omit<UserInfo['permission'], 'menus'> & { menus: Menu[] } }>("/info?f=id,username,code,role,scope,permission");
  if (raw.scope !== 'admin') throw new Error('Invalid permission scope');
  const menus = (raw.permission?.menus ?? []).filter(menu => menu.menu_key?.startsWith('admin:menu:') && menu.menu_path?.startsWith('/') && !menu.menu_path.startsWith('//'));
  const allowed = new Map(menus.map(menu => [menu.menu_key, menu.menu_path]));
  const sanitize = (nodes: PermissionNavigation[]): PermissionNavigation[] => nodes.flatMap<PermissionNavigation>(node => {
    if (!node?.resource_key?.startsWith("admin:")) return [];
    if (node.menu_key || node.menu_path) return node.menu_key && allowed.get(node.menu_key) === node.menu_path ? [{ resource_key: node.resource_key, menu_key: node.menu_key, menu_path: node.menu_path }] : [];
    const children = sanitize(Array.isArray(node.children) ? node.children : []);
    return children.length ? [{resource_key:node.resource_key,children}] : [];
  });
  return { ...raw, permission: { ...raw.permission, navigation: sanitize(raw.permission.navigation ?? []),
    menus: [...new Set(menus.map(menu => menu.menu_path).flatMap(path => path === '/system/group' ? [path, '/system/user-group'] : [path]))],
    btns: [...new Set(menus.flatMap(menu => (menu.btns ?? []).filter(key => key.startsWith(`${menu.menu_key.replace(':menu:', ':btn:')}:`))))],
  } } as UserInfo;
}

export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await jsonRequest(
        "/pub/logout",
        "POST",
        { refresh_token: refreshToken },
        { auth: false },
      );
    }
  } finally {
    clearSession();
  }
}

export async function resetPassword(newPassword: string) {
  clearLegacyLoginCredentials();
  const credential = await encryptedCredential("password_reset", {
    new_password: newPassword,
  });
  const result = await jsonRequest<LoginResult>(
    "/reset/pwd",
    "PATCH",
    credential,
  );
  acceptSession(result);
  return result;
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
  captcha?: { id: string; points: CaptchaPoint[] },
) {
  const credential = await encryptedCredential("password_change", {
    old_password: oldPassword,
    new_password: newPassword,
    captcha_id: captcha?.id,
    captcha_points: captcha?.points,
  });
  return jsonRequest("/change/pwd", "PATCH", credential);
}

export const refreshPasswordCaptcha = (captchaId: string) =>
  jsonRequest<PointCaptchaChallenge>("/captcha", "POST", {
    captcha_id: captchaId,
  });

export const verifyPasswordCaptcha = (
  captchaId: string,
  points: CaptchaPoint[],
) =>
  jsonRequest<{ captcha?: PointCaptchaChallenge; verified: boolean }>(
    "/captcha/verify",
    "POST",
    { captcha_id: captchaId, captcha_points: points },
  );

export async function userPasswordCredential(password: string) {
  return encryptedCredential("register", { password });
}

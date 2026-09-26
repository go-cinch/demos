import {
  acceptSession,
  apiRequest,
  clearSession,
  getRefreshToken,
  jsonRequest,
  type LoginResult,
} from "./client";
import { compactEncrypt, type CredentialChallenge } from "./jwe";

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

export interface UserInfo {
  code: string;
  id: number;
  permission: { btns: string[]; menus: string[] };
  role?: { id: number; name: string; word: string };
  username: string;
}

async function encryptedCredential(
  purpose: "login" | "register" | "password_change" | "password_reset",
  payload: Record<string, unknown>,
) {
  const authenticated = purpose === "password_change" || purpose === "password_reset";
  const challenge = await jsonRequest<CredentialChallenge>(
    authenticated ? "/auth/challenge" : "/auth/pub/challenge",
    "POST",
    { purpose },
    { auth: authenticated },
  );
  return {
    challenge_id: challenge.challenge_id,
    credential: await compactEncrypt(challenge, purpose, payload),
  };
}

export async function login(data: {
  captcha_id?: string;
  captcha_points?: CaptchaPoint[];
  password: string;
  remember_me: boolean;
  slider_proof: string;
  username: string;
}) {
  const credential = await encryptedCredential("login", data);
  const result = await jsonRequest<LoginResult>(
    "/auth/pub/login",
    "POST",
    credential,
    { auth: false },
  );
  acceptSession(result);
  return result;
}

export async function register(username: string, password: string, sliderProof: string) {
  const credential = await encryptedCredential("register", {
    username,
    password,
    slider_proof: sliderProof,
  });
  return jsonRequest("/auth/pub/register", "POST", credential, { auth: false });
}

export const usernameAvailability = (username: string) =>
  apiRequest<{ available: boolean }>(
    `/auth/pub/register/username?username=${encodeURIComponent(username)}`,
    { auth: false },
  );

export const loginVerification = (username: string) =>
  apiRequest<{ captcha?: PointCaptchaChallenge; captcha_required: boolean }>(
    `/auth/pub/login/verification?username=${encodeURIComponent(username)}`,
    { auth: false },
  );

export const refreshLoginCaptcha = (captchaId: string) =>
  jsonRequest<PointCaptchaChallenge>(
    "/auth/pub/captcha",
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
    "/auth/pub/captcha/verify",
    "POST",
    { username, captcha_id: captchaId, captcha_points: points },
    { auth: false },
  );

export const createSliderChallenge = (purpose: "login" | "register", username: string) =>
  jsonRequest<{ captcha_id: string; expired_at: number }>(
    "/auth/pub/slider/challenge",
    "POST",
    { purpose, username },
    { auth: false },
  );

export const verifySlider = (data: Record<string, unknown>) =>
  jsonRequest<{ proof: string }>("/auth/pub/slider/verify", "POST", data, {
    auth: false,
  });

export const getUserInfo = () => apiRequest<UserInfo>("/auth/info");

export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await jsonRequest("/auth/pub/logout", "POST", { refresh_token: refreshToken }, { auth: false });
    }
  } finally {
    clearSession();
  }
}

export async function resetPassword(newPassword: string) {
  const credential = await encryptedCredential("password_reset", {
    new_password: newPassword,
  });
  const result = await jsonRequest<LoginResult>("/auth/reset/pwd", "PATCH", credential);
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
  return jsonRequest("/auth/change/pwd", "PATCH", credential);
}

export const refreshPasswordCaptcha = (captchaId: string) =>
  jsonRequest<PointCaptchaChallenge>("/auth/captcha", "POST", {
    captcha_id: captchaId,
  });

export const verifyPasswordCaptcha = (captchaId: string, points: CaptchaPoint[]) =>
  jsonRequest<{ captcha?: PointCaptchaChallenge; verified: boolean }>(
    "/auth/captcha/verify",
    "POST",
    { captcha_id: captchaId, captcha_points: points },
  );

export async function userPasswordCredential(password: string) {
  return encryptedCredential("register", { password });
}


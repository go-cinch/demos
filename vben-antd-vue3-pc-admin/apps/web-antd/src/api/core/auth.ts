import type { JWK } from 'jose';

import { $t } from '@vben/locales';

import { CompactEncrypt, importJWK } from 'jose';

import {
  authPublicRequestClient,
  authRequestClient,
  authSessionRequestClient,
  authSilentPublicRequestClient,
} from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    captcha_id?: string;
    captcha_points?: CaptchaPoint[];
    password?: string;
    remember_me?: boolean;
    username?: string;
    slider_proof?: string;
  }

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

  export interface PointCaptchaVerificationResult {
    captcha?: PointCaptchaChallenge;
    verified: boolean;
  }

  export interface LoginFailure {
    captcha?: PointCaptchaChallenge;
    captcha_required?: boolean;
    error_code?: string;
    msg?: string;
  }

  export interface LoginVerificationResult {
    captcha?: PointCaptchaChallenge;
    captcha_required: boolean;
  }

  export interface CredentialChallenge {
    challenge_id: string;
    expired_at: number;
    key_id: string;
    public_key: JWK;
  }

  export interface EncryptedCredentialParams {
    challenge_id: string;
    credential: string;
  }

  export interface RegisterParams {
    password: string;
    slider_proof: string;
    username: string;
  }

  export interface SliderCaptchaChallenge {
    captcha_id: string;
    expired_at: number;
  }

  export interface SliderCaptchaVerification {
    captcha_id: string;
    distance: number;
    duration_ms: number;
    purpose: 'login' | 'register';
    tracks: Array<{ t: number; x: number }>;
    username: string;
    width: number;
  }

  export interface ChangePasswordParams {
    captchaId?: string;
    captchaPoints?: CaptchaPoint[];
    newPassword: string;
    oldPassword: string;
  }

  export interface PasswordChangeFailure {
    captcha?: PointCaptchaChallenge;
    captcha_required?: boolean;
    error_code?: string;
    msg?: string;
  }

  export interface UsernameAvailabilityResult {
    available: boolean;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    password_reset_required: boolean;
    access_token: string;
    expired_at: number;
    refresh_token: string;
  }
}

type CredentialPurpose =
  | 'login'
  | 'password_change'
  | 'password_reset'
  | 'register';

const credentialTypes = {
  login: 'login+jwe',
  password_change: 'password+jwe',
  password_reset: 'password-reset+jwe',
  register: 'register+jwe',
} as const satisfies Record<CredentialPurpose, string>;

async function encryptCredential(
  purpose: CredentialPurpose,
  payload: Record<string, unknown>,
) {
  const authenticated =
    purpose === 'password_change' || purpose === 'password_reset';
  const challengeClient = authenticated
    ? authRequestClient
    : authPublicRequestClient;
  const challenge = await challengeClient.post<AuthApi.CredentialChallenge>(
    authenticated ? '/auth/challenge' : '/auth/pub/challenge',
    { purpose },
  );
  const publicKey = await importJWK(challenge.public_key, 'RSA-OAEP-256');
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ challenge_id: challenge.challenge_id, ...payload }),
  );
  const credential = await new CompactEncrypt(plaintext)
    .setProtectedHeader({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      kid: challenge.key_id,
      typ: credentialTypes[purpose],
    })
    .encrypt(publicKey);
  return {
    challenge_id: challenge.challenge_id,
    credential,
  } satisfies AuthApi.EncryptedCredentialParams;
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  if (!data.username || !data.password) {
    throw new TypeError($t('app.validation.credentialsRequired'));
  }
  const encrypted = await encryptCredential('login', {
    captcha_id: data.captcha_id,
    captcha_points: data.captcha_points,
    password: data.password,
    remember_me: data.remember_me === true,
    username: data.username,
    slider_proof: data.slider_proof,
  });
  return authPublicRequestClient.post<AuthApi.LoginResult>(
    '/auth/pub/login',
    encrypted,
  );
}

/** Refresh an already-issued point-selection challenge without exposing a username. */
export async function refreshLoginCaptchaApi(captchaId: string) {
  return authPublicRequestClient.post<AuthApi.PointCaptchaChallenge>(
    '/auth/pub/captcha',
    { captcha_id: captchaId },
  );
}

/** Verify login captcha points immediately while preserving a correct challenge for login submission. */
export async function verifyLoginCaptchaApi(
  username: string,
  captchaId: string,
  captchaPoints: AuthApi.CaptchaPoint[],
) {
  return authSilentPublicRequestClient.post<AuthApi.PointCaptchaVerificationResult>(
    '/auth/pub/captcha/verify',
    {
      captcha_id: captchaId,
      captcha_points: captchaPoints,
      username,
    },
  );
}

/** Resolve the verification mode for the current username without showing background-request errors. */
export async function getLoginVerificationApi(username: string) {
  return authSilentPublicRequestClient.get<AuthApi.LoginVerificationResult>(
    '/auth/pub/login/verification',
    { params: { username } },
  );
}

export function getLoginFailure(
  error: unknown,
): AuthApi.LoginFailure | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }
  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  return data as AuthApi.LoginFailure;
}

/**
 * 创建一次性注册凭证。
 */
export async function createRegistrationCredentialApi(
  data: AuthApi.RegisterParams,
) {
  if (!data.username || !data.password) {
    throw new TypeError($t('app.validation.credentialsRequired'));
  }
  return encryptCredential('register', {
    password: data.password,
    username: data.username,
    slider_proof: data.slider_proof,
  });
}

/**
 * 创建只包含密码的一次性注册凭证。
 */
export async function createRegistrationPasswordCredentialApi(
  password: string,
) {
  if (!password) {
    throw new TypeError($t('app.validation.passwordRequired'));
  }
  return encryptCredential('register', { password });
}

/**
 * 注册
 */
export async function registerApi(data: AuthApi.RegisterParams) {
  const encrypted = await createRegistrationCredentialApi(data);
  return authPublicRequestClient.post('/auth/pub/register', encrypted);
}

export async function createSliderCaptchaChallengeApi(
  purpose: 'login' | 'register',
  username: string,
) {
  return authSilentPublicRequestClient.post<AuthApi.SliderCaptchaChallenge>(
    '/auth/pub/slider/challenge',
    { purpose, username },
  );
}

export async function verifySliderCaptchaApi(
  data: AuthApi.SliderCaptchaVerification,
) {
  return authSilentPublicRequestClient.post<{ proof: string }>(
    '/auth/pub/slider/verify',
    data,
  );
}

/**
 * 修改当前登录账号的密码。
 */
export async function changePasswordApi(data: AuthApi.ChangePasswordParams) {
  if (!data.oldPassword || !data.newPassword) {
    throw new TypeError($t('app.validation.passwordChangeRequired'));
  }
  const encrypted = await encryptCredential('password_change', {
    captcha_id: data.captchaId,
    captcha_points: data.captchaPoints,
    new_password: data.newPassword,
    old_password: data.oldPassword,
  });
  return authRequestClient.request('/auth/change/pwd', {
    data: encrypted,
    method: 'PATCH',
  });
}

/** Refresh an already-issued password-change point-selection challenge. */
export async function refreshPasswordChangeCaptchaApi(captchaId: string) {
  return authRequestClient.post<AuthApi.PointCaptchaChallenge>(
    '/auth/captcha',
    { captcha_id: captchaId },
  );
}

/** Verify password-change captcha points immediately while preserving a correct challenge for submission. */
export async function verifyPasswordChangeCaptchaApi(
  captchaId: string,
  captchaPoints: AuthApi.CaptchaPoint[],
) {
  return authRequestClient.post<AuthApi.PointCaptchaVerificationResult>(
    '/auth/captcha/verify',
    {
      captcha_id: captchaId,
      captcha_points: captchaPoints,
    },
  );
}

export function getPasswordChangeFailure(
  error: unknown,
): AuthApi.PasswordChangeFailure | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }
  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  return data as AuthApi.PasswordChangeFailure;
}

/**
 * 检查用户名是否可用
 */
export async function getUsernameAvailabilityApi(username: string) {
  return authPublicRequestClient.get<AuthApi.UsernameAvailabilityResult>(
    '/auth/pub/register/username',
    { params: { username } },
  );
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi(refreshToken: string) {
  return authSessionRequestClient.post<AuthApi.LoginResult>(
    '/auth/pub/refresh',
    { refresh_token: refreshToken },
  );
}

/**
 * 退出登录
 */
export async function logoutApi(refreshToken: string) {
  return authSessionRequestClient.post('/auth/pub/logout', {
    refresh_token: refreshToken,
  });
}

/** Complete the required first-login password reset and replace both tokens. */
export async function resetPasswordApi(newPassword: string) {
  if (!newPassword) throw new TypeError($t('app.validation.passwordRequired'));
  const encrypted = await encryptCredential('password_reset', {
    new_password: newPassword,
  });
  // A reset changes the credential version; never automatically replay it after a 401.
  return authPublicRequestClient.request<AuthApi.LoginResult>(
    '/auth/reset/pwd',
    {
      data: encrypted,
      method: 'PATCH',
    },
  );
}

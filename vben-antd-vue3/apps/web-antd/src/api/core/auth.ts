import type { JWK } from 'jose';

import type {
  RequestErrorFeedback,
  ServiceRequestConfig,
} from '#/api/request-types';
import type { UIPreferences } from '#/store/ui-preferences-contract';

import { $t } from '@vben/locales';

import { CompactEncrypt, importJWK } from 'jose';

import {
  authInlineVerificationRequestClient,
  authPublicRequestClient,
  authRequestClient,
  authSessionRequestClient,
  authSilentPublicRequestClient,
  authStatusRequestClient,
  authVerificationRequestClient,
} from '#/api/request';
import { VerificationCancelled } from '#/security/verification-prompt';

export interface SystemProperties {
  registration_enabled: boolean;
  ui_preferences?: { vben_pc: UIPreferences };
  default_locale?: string;
  locales?: { tag: string; name: string; enabled: boolean }[];
  email_enabled: boolean;
  totp_enabled: boolean;
}

export function getSystemPropertiesApi() {
  return authSilentPublicRequestClient.get<SystemProperties>('/pub/opt', {
    params: { ui: 'vben_pc' },
  });
}

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    method?: 'email_code' | 'password';
    browser_uuid?: string;
    verification_id?: string;
    verification_code?: string;
    captcha_id?: string;
    captcha_points?: CaptchaPoint[];
    password?: string;
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
    purpose: 'email_login' | 'login' | 'register';
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
    access_token: string;
    expired_at: number;
    refresh_token: string;
  }
}

type CredentialPurpose =
  | 'email_bind'
  | 'email_unbind'
  | 'login'
  | 'password_change'
  | 'password_reset'
  | 'register'
  | 'sensitive'
  | 'totp_setup';

const credentialTypes = {
  login: 'login+jwe',
  sensitive: 'sensitive+jwe',
  email_bind: 'email-bind+jwe',
  email_unbind: 'email-unbind+jwe',
  totp_setup: 'totp-setup+jwe',
  password_change: 'password+jwe',
  password_reset: 'password-reset+jwe',
  register: 'register+jwe',
} as const satisfies Record<CredentialPurpose, string>;

const inlineFeedback: ServiceRequestConfig = { suppressErrorMessage: true };

async function encryptCredential(
  purpose: CredentialPurpose,
  payload: Record<string, unknown>,
  ...requestOptions: [config?: ServiceRequestConfig]
) {
  const authenticated =
    purpose === 'sensitive' ||
    purpose === 'email_bind' ||
    purpose === 'email_unbind' ||
    purpose === 'password_change' ||
    purpose === 'password_reset' ||
    purpose === 'totp_setup';
  const challengeClient = authenticated
    ? authRequestClient
    : authPublicRequestClient;
  const challenge = await challengeClient.post<AuthApi.CredentialChallenge>(
    authenticated ? '/challenge' : '/pub/challenge',
    { purpose },
    ...requestOptions,
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
  const username = data.username?.trim();
  const password = data.password;
  if (
    !username ||
    (data.method !== 'email_code' && !password?.trim()) ||
    (data.method === 'email_code' &&
      (!data.verification_id || !data.verification_code || !data.browser_uuid))
  ) {
    throw new TypeError($t('app.validation.credentialsRequired'));
  }
  const options: [config?: ServiceRequestConfig] =
    data.method === 'email_code' ? [inlineFeedback] : [];
  const encrypted = await encryptCredential(
    'login',
    {
      method: data.method ?? 'password',
      browser_uuid: data.browser_uuid,
      verification_id: data.verification_id,
      verification_code: data.verification_code,
      captcha_id: data.captcha_id,
      captcha_points: data.captcha_points,
      password,
      remember_me: false,
      username,
      slider_proof: data.slider_proof,
    },
    ...options,
  );
  return authVerificationRequestClient.post<AuthApi.LoginResult>(
    '/pub/login',
    encrypted,
    ...options,
  );
}

/** Refresh an already-issued point-selection challenge without exposing a username. */
export async function refreshLoginCaptchaApi(captchaId: string) {
  return authPublicRequestClient.post<AuthApi.PointCaptchaChallenge>(
    '/pub/captcha',
    { captcha_id: captchaId },
  );
}

/** Verify login captcha points immediately while preserving a correct challenge for login submission. */
export async function verifyLoginCaptchaApi(
  username: string,
  captchaId: string,
  captchaPoints: AuthApi.CaptchaPoint[],
) {
  return authVerificationRequestClient.post<AuthApi.PointCaptchaVerificationResult>(
    '/pub/captcha/verify',
    {
      captcha_id: captchaId,
      captcha_points: captchaPoints,
      username,
    },
  );
}

/** Resolve the verification mode for the current username while reporting gateway outages. */
export async function getLoginVerificationApi(
  username: string,
  browser_uuid?: string,
): Promise<AuthApi.LoginVerificationResult & { email_code?: EmailCodeStatus }> {
  const status = await authVerificationRequestClient.get<
    VerificationStatus & {
      requirements: { captcha_required: boolean };
      email_code?: EmailFlowStatus['email_code'];
    }
  >('/pub/status', {
    params: {
      purpose: 'login',
      f: browser_uuid ? 'requirements,email_code' : 'requirements',
      username,
      ...(browser_uuid ? { browser_uuid } : {}),
    },
  });
  // Reading status never creates a challenge. Issuance is an explicit POST.
  const verification = status.requirements.captcha_required
    ? await authVerificationRequestClient.post<AuthApi.LoginVerificationResult>(
        '/pub/captcha',
        { username },
      )
    : { captcha_required: false };
  return {
    ...verification,
    ...(status.email_code
      ? {
          email_code: { server_time: status.server_time, ...status.email_code },
        }
      : {}),
  };
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
  if (!data.username?.trim() || !data.password?.trim()) {
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
  if (!password.trim()) {
    throw new TypeError($t('app.validation.passwordRequired'));
  }
  return encryptCredential('register', { password });
}

/**
 * 注册
 */
export async function registerApi(data: AuthApi.RegisterParams) {
  const encrypted = await createRegistrationCredentialApi(data);
  return authPublicRequestClient.post(
    '/pub/register',
    encrypted,
    inlineFeedback,
  );
}

export async function createSliderCaptchaChallengeApi(
  purpose: 'email_login' | 'login' | 'register',
  username: string,
) {
  return authVerificationRequestClient.post<AuthApi.SliderCaptchaChallenge>(
    '/pub/slider/challenge',
    { purpose, username },
  );
}

export async function verifySliderCaptchaApi(
  data: AuthApi.SliderCaptchaVerification,
) {
  return authVerificationRequestClient.post<{ proof: string }>(
    '/pub/slider/verify',
    data,
  );
}

/**
 * 修改当前登录账号的密码。
 */
export async function changePasswordApi(data: AuthApi.ChangePasswordParams) {
  if (!data.oldPassword.trim() || !data.newPassword.trim()) {
    throw new TypeError($t('app.validation.passwordChangeRequired'));
  }
  const credentialPayload = {
    captcha_id: data.captchaId,
    captcha_points: data.captchaPoints,
    new_password: data.newPassword,
    old_password: data.oldPassword,
  };
  const createCredential = () =>
    encryptCredential('password_change', credentialPayload);
  const encrypted = await createCredential();
  const options = {
    data: encrypted,
    method: 'PATCH',
    verificationRetryCredential: createCredential,
  } satisfies ServiceRequestConfig;
  return authRequestClient.request('/change/pwd', options);
}

/** Refresh an already-issued password-change point-selection challenge. */
export async function refreshPasswordChangeCaptchaApi(captchaId: string) {
  return authRequestClient.post<AuthApi.PointCaptchaChallenge>('/captcha', {
    captcha_id: captchaId,
  });
}

/** Verify password-change captcha points immediately while preserving a correct challenge for submission. */
export async function verifyPasswordChangeCaptchaApi(
  captchaId: string,
  captchaPoints: AuthApi.CaptchaPoint[],
) {
  return authRequestClient.post<AuthApi.PointCaptchaVerificationResult>(
    '/captcha/verify',
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
    '/pub/register/username',
    { params: { username } },
  );
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi(refreshToken: string, locale?: string) {
  const body = { refresh_token: refreshToken };
  if (locale) {
    return authSessionRequestClient.post<AuthApi.LoginResult>(
      '/pub/refresh',
      body,
      { headers: { 'Accept-Language': locale } },
    );
  }
  return authSessionRequestClient.post<AuthApi.LoginResult>('/pub/refresh', body);
}

/**
 * 退出登录
 */
export async function logoutApi(refreshToken: string) {
  return authSessionRequestClient.post('/pub/logout', {
    refresh_token: refreshToken,
  });
}

/** Complete the required first-login password reset and replace both tokens. */
export async function resetPasswordApi(newPassword: string) {
  if (!newPassword.trim()) {
    throw new TypeError($t('app.validation.passwordRequired'));
  }
  const encrypted = await encryptCredential('password_reset', {
    new_password: newPassword,
  });
  // A reset changes the credential version; never automatically replay it after a 401.
  return authPublicRequestClient.request<AuthApi.LoginResult>('/reset/pwd', {
    data: encrypted,
    method: 'PATCH',
  });
}

export interface VerificationStatus {
  purpose: string;
  server_time: number;
}
export interface TOTPStatus {
  password_required: boolean;
  enrollment_required: boolean;
  totp_skip_allowed?: boolean;
}
export interface TOTPBinding {
  bound: boolean;
}
interface VerificationMethods {
  totp: boolean;
  email: boolean;
  recovery_code: boolean;
  address?: string;
  fallback?: 'enroll' | 'password' | 'totp' | 'verification';
}
interface EmailFlowStatus extends VerificationStatus {
  email_code: Omit<EmailCodeStatus, 'server_time'> & { completed: boolean };
}
function emailFlowStatus(status: EmailFlowStatus): EmailCodeStatus {
  return { server_time: status.server_time, ...status.email_code };
}
export interface TOTPSetup {
  secret: string;
  uri: string;
  expired_at: number;
}
export interface TOTPEnrollment extends AuthApi.LoginResult {
  recovery_codes: string[];
}
export async function getTOTPStatusApi(): Promise<TOTPStatus> {
  const config: ServiceRequestConfig = {
    params: { purpose: 'totp_enrollment', f: 'requirements' },
    ...inlineFeedback,
  };
  const status = await authRequestClient.get<
    VerificationStatus & { requirements: TOTPStatus }
  >('/status', config);
  return status.requirements;
}
export async function getTOTPBindingApi(): Promise<TOTPBinding> {
  const info = await authRequestClient.get<{ totp: TOTPBinding }>('/info', {
    params: { f: 'totp' },
  });
  return info.totp;
}
export async function beginTOTPEnrollmentApi(
  password?: string,
  stillPending: () => boolean = () => true,
) {
  const credential = async () => {
    if (!stillPending()) throw new VerificationCancelled();
    const encrypted =
      password === undefined
        ? {}
        : await encryptCredential('totp_setup', { password }, inlineFeedback);
    if (!stillPending()) throw new VerificationCancelled();
    return encrypted;
  };
  return authRequestClient.post<TOTPSetup>('/totp/setup', await credential(), {
    ...inlineFeedback,
    verificationRetryCredential: credential,
  } as ServiceRequestConfig);
}
export const confirmTOTPEnrollmentApi = (verification_code: string) =>
  authRequestClient.post<TOTPEnrollment>(
    '/totp/confirm',
    { verification_code },
    inlineFeedback,
  );
/** Test a bound factor without creating a sensitive-operation grant or retrying a mutation. */
export const testTOTPApi = (verification_code: string) =>
  authInlineVerificationRequestClient.post<{ verified: boolean }>(
    '/totp/test',
    { verification_code },
    inlineFeedback,
  );
/** Continue password-verified login on the original endpoint. */
export const completeTOTPLoginApi = (ticket: string, code: string) => {
  const config = {
    headers: { 'X-MFA-Ticket': ticket, 'X-TOTP-Code': code },
    // Keep validation failures in the existing inline prompt.
    ...inlineFeedback,
    _verificationRetried: true,
  } satisfies ServiceRequestConfig;
  return authVerificationRequestClient.post<AuthApi.LoginResult>(
    '/pub/login',
    {},
    config,
  );
};
/** Recovery resets the old factor and returns a session restricted to enrollment. */
export const recoverTOTPLoginApi = async (
  ticket: string,
  recoveryCode: string,
  username?: string,
  password?: string,
) => {
  const config = {
    headers: { 'X-MFA-Ticket': ticket, 'X-Recovery-Code': recoveryCode },
    ...inlineFeedback,
    _verificationRetried: true,
  } satisfies ServiceRequestConfig;
  const body = password
    ? await encryptCredential(
        'login',
        { username, password, method: 'password' },
        inlineFeedback,
      )
    : {};
  return authVerificationRequestClient.post<AuthApi.LoginResult>(
    '/pub/login',
    body,
    config,
  );
};
export async function requestVerificationResetEmailApi(
  ticket: string,
  username: string,
  password: string,
  browser_uuid: string,
) {
  const credential = await encryptCredential(
    'login',
    { method: 'password', username, password, browser_uuid },
    inlineFeedback,
  );
  const options = {
    ...inlineFeedback,
    headers: { 'X-MFA-Ticket': ticket },
    _verificationRetried: true,
  } satisfies ServiceRequestConfig;
  return authVerificationRequestClient.post<EmailCodeStatus>(
    '/pub/totp/reset/email-code',
    credential,
    options,
  );
}

export async function confirmTOTPResetEmailApi(
  ticket: string,
  username: string,
  browser_uuid: string,
  verification_id: string,
  verification_code: string,
) {
  const credential = await encryptCredential(
    'login',
    {
      method: 'email_code',
      username,
      browser_uuid,
      verification_id,
      verification_code,
    },
    inlineFeedback,
  );
  const options = {
    ...inlineFeedback,
    headers: { 'X-MFA-Ticket': ticket },
    _verificationRetried: true,
  } satisfies ServiceRequestConfig;
  return authVerificationRequestClient.post<AuthApi.LoginResult>(
    '/pub/totp/reset/confirm',
    credential,
    options,
  );
}

export const sendAccountResetEmailApi = (browser_uuid: string) =>
  authInlineVerificationRequestClient.post<EmailCodeStatus>(
    '/totp/recovery/email-code',
    { browser_uuid },
    inlineFeedback,
  );

export function confirmAccountResetApi(
  proof: (SensitiveEmailTicket & { verification_code: string }) | string,
) {
  const recovery = typeof proof === 'string';
  return authInlineVerificationRequestClient.post<AuthApi.LoginResult>(
    '/totp/recovery/confirm',
    recovery ? {} : proof,
    {
      ...inlineFeedback,
      ...(recovery ? { headers: { 'X-Recovery-Code': proof } } : {}),
    },
  );
}

export const resetUserTOTPApi = (id: number) =>
  authRequestClient.post(`/totp/reset/${id}`);

export interface EmailCodeStatus {
  server_time: number;
  retry_at: number;
  verification_id?: string;
  expired_at?: number;
}
export interface SensitiveEmailTicket {
  browser_uuid: string;
  verification_id: string;
}

export async function getLoginRecoveryOptionsApi(ticket: string) {
  const status = await authVerificationRequestClient.get<
    VerificationStatus & { methods: VerificationMethods }
  >('/pub/status', {
    ...inlineFeedback,
    params: { purpose: 'login_totp_recovery', f: 'methods' },
    headers: { 'X-MFA-Ticket': ticket },
  });
  return {
    address:
      status.methods.email === true &&
      typeof status.methods.address === 'string'
        ? status.methods.address
        : '',
  };
}

export async function getSensitiveOptionsApi(
  purpose: 'sensitive' | 'totp_recovery' = 'sensitive',
) {
  const status = await authInlineVerificationRequestClient.get<
    VerificationStatus & { methods: VerificationMethods }
  >('/status', {
    ...inlineFeedback,
    params: { purpose, f: 'methods' },
  });
  return {
    totp: status.methods.totp,
    address: status.methods.email ? (status.methods.address ?? '') : '',
  };
}

/** Read the send budget before entering an existing-mailbox verification flow. */
export async function getMailboxCooldownApi(
  browser_uuid: string,
  purpose: 'sensitive' | 'totp_recovery',
  ticket?: string,
) {
  const status = ticket
    ? await authVerificationRequestClient.get<EmailFlowStatus>('/pub/status', {
        ...inlineFeedback,
        params: {
          purpose: 'login_totp_recovery',
          f: 'email_code',
          browser_uuid,
        },
        headers: { 'X-MFA-Ticket': ticket },
      })
    : await authInlineVerificationRequestClient.get<EmailFlowStatus>(
        '/status',
        {
          ...inlineFeedback,
          params: { purpose, f: 'email_code', browser_uuid },
        },
      );
  return emailFlowStatus(status);
}

export const sendSensitiveEmailApi = (browser_uuid: string) =>
  authInlineVerificationRequestClient.post<EmailCodeStatus>(
    '/email/sensitive-code',
    { browser_uuid },
    inlineFeedback,
  );

export function encryptSensitiveEmailCode(
  code: string,
  ticket: SensitiveEmailTicket,
) {
  return encryptCredential(
    'sensitive',
    {
      verification_code: code,
      method: 'email',
      ...ticket,
    },
    inlineFeedback,
  );
}

export interface EmailCodeRequest {
  browser_uuid: string;
  username?: string;
  email?: string;
  slider_proof?: string;
  captcha_id?: string;
  captcha_points?: AuthApi.CaptchaPoint[];
}
export async function getLoginEmailCodeStatusApi(
  browser_uuid: string,
  username?: string,
) {
  return emailFlowStatus(
    await authVerificationRequestClient.get<EmailFlowStatus>('/pub/status', {
      params: {
        purpose: 'login',
        f: 'email_code',
        browser_uuid,
        ...(username ? { username } : {}),
      },
    }),
  );
}
export const sendLoginEmailCodeApi = (data: EmailCodeRequest) =>
  authVerificationRequestClient.post<EmailCodeStatus>(
    '/pub/login/email-code',
    data,
    inlineFeedback,
  );
export async function getBindEmailCodeStatusApi(
  browser_uuid: string,
  email?: string,
  options?: Pick<ServiceRequestConfig, 'suppressErrorMessage'>,
) {
  const config: ServiceRequestConfig = {
    params: {
      purpose: 'email_bind',
      f: 'email_code',
      browser_uuid,
      ...(email ? { email } : {}),
    },
    ...options,
  };
  return emailFlowStatus(
    await authInlineVerificationRequestClient.get<EmailFlowStatus>(
      '/status',
      config,
    ),
  );
}
export const sendBindEmailCodeApi = (data: EmailCodeRequest) =>
  authInlineVerificationRequestClient.post<EmailCodeStatus>(
    '/email/code',
    data,
    inlineFeedback,
  );
export async function bindEmailApi(
  data: {
    browser_uuid: string;
    email: string;
    verification_code: string;
    verification_id: string;
  },
  stillPending?: () => boolean,
) {
  const credential = async () => {
    if (stillPending && !stillPending()) throw new VerificationCancelled();
    const encrypted = await encryptCredential(
      'email_bind',
      data,
      inlineFeedback,
    );
    if (stillPending && !stillPending()) throw new VerificationCancelled();
    return encrypted;
  };
  const options: ServiceRequestConfig = {
    ...inlineFeedback,
    verificationRetryCredential: credential,
  };
  return authRequestClient.post<AuthApi.LoginResult>(
    '/email/bind',
    await credential(),
    options,
  );
}

export interface EmailUnlinkStatus extends EmailCodeStatus {
  bound: boolean;
  can_send: boolean;
  fallback: 'enroll' | 'password' | 'totp';
}

export async function getEmailUnlinkStatusApi(
  browser_uuid: string,
): Promise<EmailUnlinkStatus> {
  const config: ServiceRequestConfig = {
    params: { purpose: 'email_unbind', f: 'methods,email_code', browser_uuid },
    ...inlineFeedback,
  };
  const status = await authInlineVerificationRequestClient.get<
    EmailFlowStatus & { methods: VerificationMethods }
  >('/status', config);
  if (!status.methods.fallback)
    throw new Error('Missing email unlink verification method');
  return {
    ...emailFlowStatus(status),
    bound: !status.email_code.completed,
    can_send: status.methods.email,
    fallback:
      status.methods.fallback === 'verification'
        ? 'totp'
        : status.methods.fallback,
  };
}
export async function getEmailUnlinkProgressApi(browser_uuid: string) {
  const config: ServiceRequestConfig = {
    params: { purpose: 'email_unbind', f: 'email_code', browser_uuid },
    ...inlineFeedback,
  };
  const status = await authInlineVerificationRequestClient.get<EmailFlowStatus>(
    '/status',
    config,
  );
  return { ...emailFlowStatus(status), bound: !status.email_code.completed };
}

export const requestEmailUnlinkApi = (browser_uuid: string) =>
  authInlineVerificationRequestClient.post<EmailCodeStatus>(
    '/email/unbind/request',
    { browser_uuid },
    inlineFeedback,
  );

export async function verifyEmailUnlinkApi(
  proof: { password: string } | { verification_code: string },
  current: () => boolean,
) {
  if ('verification_code' in proof) {
    if (!current()) throw new DOMException('Unlink cancelled', 'AbortError');
    return authInlineVerificationRequestClient.post<undefined>(
      '/email/unbind',
      {},
      {
        ...inlineFeedback,
        headers: { 'X-TOTP-Code': proof.verification_code },
      },
    );
  }
  const data = await encryptCredential('email_unbind', proof, inlineFeedback);
  if (!current()) throw new DOMException('Unlink cancelled', 'AbortError');
  return authInlineVerificationRequestClient.post<undefined>(
    '/email/unbind',
    data,
    inlineFeedback,
  );
}

export const confirmEmailUnlinkApi = (token: string) =>
  authSilentPublicRequestClient.post<{ already_confirmed: boolean }>(
    '/pub/email/unbind',
    { token },
  );

export function skipOnboardingApi(
  step: 'password' | 'totp',
  feedback?: RequestErrorFeedback,
) {
  const config: ServiceRequestConfig = {
    method: 'PATCH',
    data: {
      metadata: {
        [step === 'totp'
          ? 'totp_enrollment_skipped'
          : 'password_reset_skipped']: true,
      },
    },
    ...feedback,
  };
  return authRequestClient.request<undefined>('/info', config);
}

export interface OnboardingRequirements {
  totp_onboarding_hidden?: boolean;
  password_reset_onboarding_hidden?: boolean;
  email_onboarding_hidden?: boolean;
  totp_skip_allowed?: boolean;
  password_reset_skip_allowed?: boolean;
  password_reset_reason?: 'admin_reset' | 'first_login';
  password_reset_required: boolean;
  totp_enrollment_required: boolean;
  email_binding_required: boolean;
}
export async function getOnboardingStatusApi(
  feedback?: RequestErrorFeedback,
): Promise<OnboardingRequirements> {
  const config: ServiceRequestConfig = {
    params: { purpose: 'onboarding', f: 'requirements' },
    ...feedback,
  };
  const result = await authStatusRequestClient.get<
    VerificationStatus & { requirements: OnboardingRequirements }
  >('/status', config);
  const value = result.requirements;
  if (
    !value ||
    [
      'password_reset_required',
      'totp_enrollment_required',
      'email_binding_required',
    ].some(
      (key) => typeof value[key as keyof OnboardingRequirements] !== 'boolean',
    )
  ) {
    throw new Error('Invalid onboarding status');
  }
  return value;
}
export async function getSensitiveStatusApi(suppressErrorMessage: boolean) {
  return authInlineVerificationRequestClient.get<
    VerificationStatus & {
      methods: VerificationMethods;
      grant: { expired_at: number };
    }
  >('/status', {
    params: { purpose: 'sensitive', f: 'methods,grant' },
    suppressErrorMessage,
  } as ServiceRequestConfig);
}

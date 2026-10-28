import {
  gatewayMessage,
  isBadGatewayError,
  notifyRequestFailure
} from '@/utils/admin/request-error'
import type { JWK } from 'jose'

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { CompactEncrypt, importJWK } from 'jose'

import { i18n } from '@/locales/instance'
import { useUserStore } from '@/store/modules/user'
import { recordLoginAccount } from '@/utils/login-account-history'

export interface CaptchaPoint {
  x: number
  y: number
}

export interface PointCaptchaChallenge {
  captcha_id: string
  captcha_image: string
  expired_at: number
  height: number
  hint_text: string
  target_count: number
  width: number
}

export interface CredentialChallenge {
  challenge_id: string
  expired_at: number
  key_id: string
  public_key: JWK
}

export interface SessionResult {
  access_token: string
  expired_at: number
  password_reset_required: boolean
  refresh_token: string
}

export interface PermissionNavigation {
  resource_key: string
  menu_key?: string
  menu_path?: string
  children?: PermissionNavigation[]
}
export interface AuthInfo {
  code: string
  id: number
  scope: string
  permission: {
    permission_scope?: '*'
    permission_scopes?: string[]
    navigation?: PermissionNavigation[]
    words: string[]
    menus: Array<{ menu_key: string; menu_path: string; parent_menu_key?: string; btns: string[] }>
  }
  role?: { id: number; name: string; word: string }
  username: string
}

export interface LoginParams {
  captcha_id?: string
  captcha_points?: CaptchaPoint[]
  password: string
  slider_proof?: string
  username: string
}

export type CredentialPurpose = 'login' | 'register' | 'password_change' | 'password_reset'

const credentialTypes: Record<CredentialPurpose, string> = {
  login: 'login+jwe',
  register: 'register+jwe',
  password_change: 'password+jwe',
  password_reset: 'password-reset+jwe'
}

const authApiURL = import.meta.env.VITE_GLOB_AUTH_API_URL || '/api/auth'
const publicClient = axios.create({ baseURL: authApiURL, timeout: 15000 })
const client = axios.create({ baseURL: authApiURL, timeout: 15000 })
let refreshPromise: Promise<string> | null = null

function localeHeader() {
  const locale = i18n.global.locale
  const current = typeof locale === 'string' ? locale : locale.value
  return current === 'en' ? 'en-US' : 'zh-CN'
}

function prepare(config: InternalAxiosRequestConfig) {
  config.headers.set('Accept-Language', localeHeader())
  config.headers.set('X-Auth-Scope', 'admin')
  return config
}

publicClient.interceptors.request.use(prepare)
client.interceptors.request.use((config) => {
  prepare(config)
  const token = useUserStore().accessToken
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

function backendMessage(error: AxiosError<{ error_code?: string; msg?: string }>) {
  return isBadGatewayError(error) ? gatewayMessage() : error.response?.data?.msg || error.message
}

publicClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error_code?: string; msg?: string }>) => {
    if (isBadGatewayError(error)) {
      error.message = gatewayMessage()
      notifyRequestFailure(error.message)
    }
    return Promise.reject(error)
  }
)

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error_code?: string; msg?: string }>) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined
    const store = useUserStore()
    if (error.response?.data?.error_code === 'AUTH_PASSWORD_RESET_REQUIRED') {
      store.passwordResetRequired = true
      if (location.pathname !== '/reset-password') location.assign('/reset-password')
      return Promise.reject(error)
    }
    if (error.response?.status === 401 && original && !original._retried && store.refreshToken) {
      original._retried = true
      try {
        refreshPromise ||= refreshSession(store.refreshToken).then((session) => {
          store.acceptSession(session)
          return session.access_token
        })
        const token = await refreshPromise.finally(() => (refreshPromise = null))
        original.headers.set('Authorization', `Bearer ${token}`)
        return client(original)
      } catch {
        store.logOut()
      }
    }
    if (isBadGatewayError(error)) error.message = gatewayMessage()
    notifyRequestFailure(backendMessage(error))
    return Promise.reject(error)
  }
)

async function encryptCredential(purpose: CredentialPurpose, payload: Record<string, unknown>) {
  const normalized = { ...payload }
  for (const key of ['username', 'password', 'old_password', 'new_password']) {
    const value = normalized[key]
    if (typeof value === 'string') normalized[key] = value.trim()
  }
  const authenticated = purpose === 'password_change' || purpose === 'password_reset'
  const api = authenticated ? client : publicClient
  const path = authenticated ? '/challenge' : '/pub/challenge'
  const { data: challenge } = await api.post<CredentialChallenge>(path, { purpose })
  const key = await importJWK(challenge.public_key, 'RSA-OAEP-256')
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ challenge_id: challenge.challenge_id, ...normalized })
  )
  const credential = await new CompactEncrypt(plaintext)
    .setProtectedHeader({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      kid: challenge.key_id,
      typ: credentialTypes[purpose]
    })
    .encrypt(key)
  return { challenge_id: challenge.challenge_id, credential }
}

export async function login(data: LoginParams) {
  const encrypted = await encryptCredential('login', {
    captcha_id: data.captcha_id,
    captcha_points: data.captcha_points,
    password: data.password,
    remember_me: false,
    slider_proof: data.slider_proof,
    username: data.username.trim()
  })
  const session = (await publicClient.post<SessionResult>('/pub/login', encrypted)).data
  if (session.access_token) recordLoginAccount(data.username)
  return session
}

export async function register(username: string, password: string, sliderProof: string) {
  const encrypted = await encryptCredential('register', {
    password,
    slider_proof: sliderProof,
    username
  })
  return (await publicClient.post('/pub/register', encrypted)).data
}

export async function usernameAvailable(username: string) {
  return (
    await publicClient.get<{ available: boolean }>('/pub/register/username', {
      params: { username }
    })
  ).data
}

export async function loginVerification(username: string) {
  return (
    await publicClient.get<{ captcha?: PointCaptchaChallenge; captcha_required: boolean }>(
      '/pub/login/verification',
      { params: { username } }
    )
  ).data
}

export async function refreshLoginCaptcha(captchaId: string) {
  return (await publicClient.post<PointCaptchaChallenge>('/pub/captcha', { captcha_id: captchaId }))
    .data
}

export async function verifyLoginCaptcha(
  username: string,
  captchaId: string,
  points: CaptchaPoint[]
) {
  return (
    await publicClient.post<{ captcha?: PointCaptchaChallenge; verified: boolean }>(
      '/pub/captcha/verify',
      { captcha_id: captchaId, captcha_points: points, username }
    )
  ).data
}

export async function createSliderChallenge(purpose: 'login' | 'register', username: string) {
  return (
    await publicClient.post<{ captcha_id: string; expired_at: number }>('/pub/slider/challenge', {
      purpose,
      username
    })
  ).data
}

export async function verifySlider(data: {
  captcha_id: string
  distance: number
  duration_ms: number
  purpose: 'login' | 'register'
  tracks: Array<{ t: number; x: number }>
  username: string
  width: number
}) {
  return (await publicClient.post<{ proof: string }>('/pub/slider/verify', data)).data
}

export async function getAuthInfo() {
  return (
    await client.get<AuthInfo>('/info', { params: { f: 'id,username,code,role,scope,permission' } })
  ).data
}

export async function refreshSession(refreshToken: string) {
  return (await publicClient.post<SessionResult>('/pub/refresh', { refresh_token: refreshToken }))
    .data
}

export async function logout(refreshToken: string) {
  await publicClient.post('/pub/logout', { refresh_token: refreshToken })
}

export async function resetPassword(newPassword: string) {
  const encrypted = await encryptCredential('password_reset', { new_password: newPassword })
  const token = useUserStore().accessToken
  return (
    await publicClient.patch<SessionResult>('/reset/pwd', encrypted, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
  ).data
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
  captcha?: { captchaId: string; points: CaptchaPoint[] }
) {
  const encrypted = await encryptCredential('password_change', {
    captcha_id: captcha?.captchaId,
    captcha_points: captcha?.points,
    new_password: newPassword,
    old_password: oldPassword
  })
  return (await client.patch('/change/pwd', encrypted)).data
}

export async function refreshPasswordCaptcha(captchaId: string) {
  return (await client.post<PointCaptchaChallenge>('/captcha', { captcha_id: captchaId })).data
}

export async function verifyPasswordCaptcha(captchaId: string, points: CaptchaPoint[]) {
  return (
    await client.post<{ captcha?: PointCaptchaChallenge; verified: boolean }>('/captcha/verify', {
      captcha_id: captchaId,
      captcha_points: points
    })
  ).data
}

export async function createPasswordCredential(password: string) {
  return encryptCredential('register', { password })
}

export { client as authClient, publicClient as authPublicClient }

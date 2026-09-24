import type { Recordable, UserInfo } from '@vben/types';

import type { AuthApi } from '#/api';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import {
  getLoginFailure,
  getLoginVerificationApi,
  getUserInfoApi,
  loginApi,
  logoutApi,
  refreshLoginCaptchaApi,
  refreshTokenApi,
  resetPasswordApi,
  verifyLoginCaptchaApi,
} from '#/api';
import { $t } from '#/locales';

interface RegistrationLoginCredentials {
  password: string;
  username: string;
}

const REMEMBER_ME_KEY = `REMEMBER_ME_CREDENTIALS_${location.hostname}`;
const LEGACY_REMEMBER_ME_KEY = `REMEMBER_ME_USERNAME_${location.hostname}`;

export function stageRegistrationLogin(
  credentials: RegistrationLoginCredentials,
) {
  localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify(credentials));
  localStorage.removeItem(LEGACY_REMEMBER_ME_KEY);
}

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);
  const passwordResetRequired = ref(false);
  const loginCaptcha = ref<AuthApi.PointCaptchaChallenge>();
  let loginCaptchaUsername = '';
  let loginVerificationRequest = 0;
  let sessionRestoreAttempted = false;

  function resetLoginVerification() {
    loginVerificationRequest += 1;
    loginCaptcha.value = undefined;
    loginCaptchaUsername = '';
  }

  async function checkLoginVerification(username: string) {
    const request = ++loginVerificationRequest;
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      loginCaptcha.value = undefined;
      loginCaptchaUsername = '';
      return;
    }
    try {
      const verification = await getLoginVerificationApi(normalizedUsername);
      if (request !== loginVerificationRequest) return;
      loginCaptcha.value = verification.captcha_required
        ? verification.captcha
        : undefined;
      loginCaptchaUsername = loginCaptcha.value ? normalizedUsername : '';
    } catch {
      if (request === loginVerificationRequest) {
        loginCaptcha.value = undefined;
        loginCaptchaUsername = '';
      }
    }
  }

  /**
   * 异步处理登录操作
   * Asynchronously handle the login process
   * @param params 登录表单数据
   */
  async function authLogin(
    params: Recordable<any>,
    onSuccess?: () => Promise<void> | void,
  ) {
    // 异步处理用户登录操作并获取 accessToken
    let userInfo: null | UserInfo = null;
    try {
      loginVerificationRequest += 1;
      loginLoading.value = true;
      const captcha = loginCaptcha.value;
      const result = await loginApi({
        ...params,
        captcha_id: captcha?.captcha_id,
        captcha_points: captcha ? params.captchaPoints : undefined,
        remember_me: params.rememberMe === true,
      });

      // 如果成功获取到 accessToken
      if (result.access_token) {
        acceptSession(result);
        if (passwordResetRequired.value) {
          resetLoginVerification();
          accessStore.setLoginExpired(false);
          await router.replace('/auth/reset-password');
          return { userInfo };
        }

        // 获取用户信息并存储到 accessStore 中
        const fetchUserInfoResult = await fetchUserInfo();

        userInfo = fetchUserInfoResult;

        userStore.setUserInfo(userInfo);

        if (accessStore.loginExpired) {
          accessStore.setLoginExpired(false);
        } else {
          onSuccess
            ? await onSuccess?.()
            : await router.push(
                userInfo.homePath || preferences.app.defaultHomePath,
              );
        }

        if (userInfo?.realName) {
          notification.success({
            description: `${$t('authentication.loginSuccessDesc')}:${userInfo?.realName}`,
            duration: 3,
            message: $t('authentication.loginSuccess'),
          });
        }
        loginCaptcha.value = undefined;
        loginCaptchaUsername = '';
      }
    } catch (error) {
      const failure = getLoginFailure(error);
      if (failure?.captcha_required) {
        loginCaptcha.value = failure.captcha;
        loginCaptchaUsername = failure.captcha
          ? String(params.username ?? '').trim()
          : '';
      }
    } finally {
      loginLoading.value = false;
    }

    return {
      userInfo,
    };
  }

  async function refreshLoginCaptcha() {
    const captchaId = loginCaptcha.value?.captcha_id;
    if (!captchaId) return;
    try {
      loginCaptcha.value = await refreshLoginCaptchaApi(captchaId);
    } catch {
      loginCaptcha.value = undefined;
      loginCaptchaUsername = '';
    }
  }

  async function verifyLoginCaptcha(points: AuthApi.CaptchaPoint[]) {
    const captcha = loginCaptcha.value;
    const username = loginCaptchaUsername;
    if (!captcha || !username) {
      return {
        verified: false,
      } satisfies AuthApi.PointCaptchaVerificationResult;
    }
    const request = ++loginVerificationRequest;
    const result = await verifyLoginCaptchaApi(
      username,
      captcha.captcha_id,
      points,
    );
    if (request !== loginVerificationRequest) {
      return {
        verified: false,
      } satisfies AuthApi.PointCaptchaVerificationResult;
    }
    if (!result.verified) {
      loginCaptcha.value = result.captcha;
    }
    return result;
  }

  async function logout(redirect: boolean = true) {
    try {
      if (accessStore.refreshToken) {
        await logoutApi(accessStore.refreshToken);
      }
    } catch {
      // 不做任何处理
    }
    resetAllStores();
    resetLoginVerification();
    sessionRestoreAttempted = true;
    accessStore.setLoginExpired(false);

    // 回登录页带上当前路由地址
    await router.replace({
      path: LOGIN_PATH,
      query: redirect
        ? {
            redirect: encodeURIComponent(router.currentRoute.value.fullPath),
          }
        : {},
    });
  }

  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();
    accessStore.setAccessCodes(userInfo.permission.btns);
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  async function restoreSession() {
    if (accessStore.accessToken) {
      return true;
    }
    if (sessionRestoreAttempted) {
      return false;
    }
    sessionRestoreAttempted = true;
    const refreshToken = accessStore.refreshToken;
    if (!refreshToken) {
      return false;
    }
    try {
      acceptSession(await refreshTokenApi(refreshToken));
      return true;
    } catch {
      accessStore.setRefreshToken(null);
      accessStore.setAccessToken(null);
      return false;
    }
  }

  function acceptSession(result: AuthApi.LoginResult) {
    sessionRestoreAttempted = true;
    passwordResetRequired.value = result.password_reset_required;
    accessStore.setRefreshToken(result.refresh_token);
    accessStore.setAccessToken(result.access_token);
    if (passwordResetRequired.value) {
      accessStore.setIsAccessChecked(false);
      userStore.$reset();
    }
  }

  async function requirePasswordReset() {
    passwordResetRequired.value = true;
    accessStore.setIsAccessChecked(false);
    await router.replace('/auth/reset-password');
  }

  async function completePasswordReset(newPassword: string) {
    acceptSession(await resetPasswordApi(newPassword));
    accessStore.setIsAccessChecked(false);
    const info = await fetchUserInfo();
    // Keep an existing remembered credential in sync; do not enable remembering.
    try {
      const remembered = JSON.parse(
        localStorage.getItem(REMEMBER_ME_KEY) || 'null',
      );
      if (remembered?.username === info.username) {
        stageRegistrationLogin({
          username: info.username,
          password: newPassword,
        });
      }
    } catch {
      /* Remembered credentials are optional. */
    }
    notification.success({ message: $t('app.resetPassword.success') });
    await router.replace(info.homePath || preferences.app.defaultHomePath);
  }

  function $reset() {
    passwordResetRequired.value = false;
    loginLoading.value = false;
    resetLoginVerification();
  }

  return {
    $reset,
    acceptSession,
    authLogin,
    completePasswordReset,
    passwordResetRequired,
    requirePasswordReset,
    checkLoginVerification,
    fetchUserInfo,
    loginCaptcha,
    loginLoading,
    logout,
    refreshLoginCaptcha,
    resetLoginVerification,
    restoreSession,
    verifyLoginCaptcha,
  };
});

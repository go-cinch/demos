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

import { recordLoginAccount } from './login-account-history';
import { playLoginTransition } from './login-transition';

interface RegistrationLoginCredentials {
  password: string;
  username: string;
}

let pendingRegistrationLogin: null | RegistrationLoginCredentials = null;

export function stageRegistrationLogin(
  credentials: RegistrationLoginCredentials,
) {
  pendingRegistrationLogin = {
    password: credentials.password,
    username: credentials.username,
  };
}

export function consumeRegistrationLogin() {
  const credentials = pendingRegistrationLogin;
  pendingRegistrationLogin = null;
  return credentials;
}

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);
  const loginEntering = ref(false);
  const passwordResetRequired = ref(false);
  const loginCaptcha = ref<AuthApi.PointCaptchaChallenge>();
  let loginCaptchaUsername = '';
  let loginVerificationRequest = 0;
  let sessionRestoreAttempted = false;
  let sessionEpoch = 0;

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
    if (loginLoading.value) return { userInfo };
    try {
      loginVerificationRequest += 1;
      loginLoading.value = true;
      const captcha = loginCaptcha.value;
      const result = await loginApi({
        ...params,
        captcha_id: captcha?.captcha_id,
        captcha_points: captcha ? params.captchaPoints : undefined,
        slider_proof: params.sliderProof,
      });

      // 如果成功获取到 accessToken
      if (result.access_token) {
        acceptSession(result);
        recordLoginAccount(String(params.username ?? ''));
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
          const currentPath = router.currentRoute.value.path;
          if (!fetchUserInfoResult.permission.menus.some((menu) => menu.menu_path === currentPath)) {
            await router.replace(fetchUserInfoResult.homePath || '/forbidden');
          }
        } else {
          loginEntering.value = true;
          await playLoginTransition();
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
      loginEntering.value = false;
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
    const epoch = ++sessionEpoch;
    try {
      if (accessStore.refreshToken) {
        await logoutApi(accessStore.refreshToken);
      }
    } catch {
      // 不做任何处理
    }
    if (epoch !== sessionEpoch) return;
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

  let userInfoFlight: { epoch: number; request: ReturnType<typeof getUserInfoApi> } | undefined;
  async function fetchUserInfo(options: { fresh?: boolean } = {}): Promise<Awaited<ReturnType<typeof getUserInfoApi>>> {
    const epoch = sessionEpoch;
    const previousFlight = userInfoFlight;
    if (previousFlight?.epoch === epoch) {
      if (!options.fresh) return previousFlight.request;
      // A write/403 can invalidate a request that started before the change.
      // Serialize behind it, then issue (or join) a request started afterwards.
      try { await previousFlight.request; } catch { /* Still refresh if this session is current. */ }
      if (sessionEpoch !== epoch || !accessStore.accessToken) throw new Error('Permission response belongs to an expired session');
      if (userInfoFlight?.request === previousFlight.request) userInfoFlight = undefined;
      return fetchUserInfo();
    }
    const request = (async () => {
      const previousPaths = JSON.stringify(userStore.userInfo?.roles ?? []);
      const previousNavigation = JSON.stringify((userStore.userInfo as Awaited<ReturnType<typeof getUserInfoApi>> | null)?.permission?.navigation);
      const userInfo = await getUserInfoApi();
      const assertSession = () => {
        if (sessionEpoch !== epoch || !accessStore.accessToken) throw new Error('Permission response belongs to an expired session');
      };
      assertSession();
      accessStore.setAccessCodes([...userInfo.permission.words, ...userInfo.permission.menus.flatMap((menu) => menu.btns)]);
      userStore.setUserInfo(userInfo);
      if (accessStore.isAccessChecked && (previousPaths !== JSON.stringify(userInfo.roles) || previousNavigation !== JSON.stringify(userInfo.permission.navigation))) {
        const [{ generateAccess }, { accessRoutes }, { resetRoutes }] = await Promise.all([
          import('#/router/access'), import('#/router/routes'), import('#/router'),
        ]);
        assertSession();
        resetRoutes();
        const { accessibleMenus, accessibleRoutes } = await generateAccess({ roles: userInfo.roles, router, routes: accessRoutes, permissionMenus: userInfo.permission.menus, navigation: userInfo.permission.navigation });
        assertSession();
        accessStore.setAccessMenus(accessibleMenus);
        accessStore.setAccessRoutes(accessibleRoutes);
      }
      return userInfo;
    })();
    userInfoFlight = { epoch, request };
    try { return await request; }
    finally { if (userInfoFlight?.request === request) userInfoFlight = undefined; }
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
    const epoch = sessionEpoch;
    try {
      const result = await refreshTokenApi(refreshToken);
      if (epoch !== sessionEpoch || accessStore.refreshToken !== refreshToken) return Boolean(accessStore.accessToken);
      acceptSession(result);
      return true;
    } catch {
      if (epoch !== sessionEpoch || accessStore.refreshToken !== refreshToken) return Boolean(accessStore.accessToken);
      accessStore.setRefreshToken(null);
      accessStore.setAccessToken(null);
      return false;
    }
  }

  function acceptSession(result: AuthApi.LoginResult, refreshCurrentSession = false) {
    if (!refreshCurrentSession) sessionEpoch += 1;
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
    await playLoginTransition();
    notification.success({ message: $t('app.resetPassword.success') });
    await router.replace(info.homePath || preferences.app.defaultHomePath);
  }

  function $reset() {
    sessionEpoch += 1;
    pendingRegistrationLogin = null;
    passwordResetRequired.value = false;
    loginLoading.value = false;
    loginEntering.value = false;
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
    loginEntering,
    logout,
    refreshLoginCaptcha,
    resetLoginVerification,
    restoreSession,
    verifyLoginCaptcha,
  };
});

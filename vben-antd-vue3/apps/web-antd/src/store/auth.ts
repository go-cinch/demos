import type { UserPreferenceChange } from '@vben/preferences';
import type { Recordable, UserInfo } from '@vben/types';

import type { AuthApi } from '#/api';
import type { UserInfoWithPermissions } from '#/api/core/user';
import type { RequestErrorFeedback } from '#/api/request-types';

import { ref } from 'vue';

import { LOGIN_PATH } from '@vben/constants';
import { loadLocaleMessages } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';
import { browserSession } from '@vben/stores/session';
import { userCache } from '@vben/utils/cache';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import {
  getLoginFailure,
  getLoginVerificationApi,
  getOnboardingStatusApi,
  getUserInfoApi,
  loginApi,
  logoutApi,
  refreshLoginCaptchaApi,
  refreshTokenApi,
  resetPasswordApi,
  skipEmailBindingApi,
  skipOnboardingApi,
  verifyLoginCaptchaApi,
} from '#/api';
import {
  isTransportFailure,
  isUnauthorizedError,
  requestErrorMessage,
} from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { $t } from '#/locales';
import { resolveCatalogLocale } from '#/locales/catalog';
// Public request interceptors can create this store before app.use(router).
// Use the application instance instead of component-scoped router injection.
import { router } from '#/router';
import { setTOTPEnrollmentSource } from '#/security/totp-enrollment-context';
import { cancelVerification } from '#/security/verification-prompt';

import { createLanguagePreferenceSync } from './language-preference';
import { recordLoginAccount } from './login-account-history';
import {
  consumeAccountReturn,
  loginDestination,
  loginRedirectQuery,
  rememberAccountReturn,
} from './login-destination';
import { rememberLoginPagePreferences } from './login-page-preferences';
import { playLoginTransition } from './login-transition';
import { bindSessionCache, releaseSessionCache } from './session-cache';
import { loadSystemProperties } from './system-properties';
import { createTimezonePreferenceSync } from './timezone-preference';
import { createUIPreferenceSync } from './ui-preferences';

interface RegistrationLoginCredentials {
  password: string;
  username: string;
}

let pendingRegistrationLogin: null | RegistrationLoginCredentials = null;
const totpOnboardingFeedback: RequestErrorFeedback = {
  suppressErrorMessage: true,
};

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

  const loginLoading = ref(false);
  const loginFailureMessage = ref('');
  const loginFailureCode = ref('');
  const emailBindingRequired = ref(false);
  const loginEntering = ref(false);
  const emailOnboardingHidden = ref(false);
  const passwordResetRequired = ref(false);
  const passwordResetSkipAllowed = ref(false);
  const passwordResetByAdmin = ref(false);
  const totpSkipAllowed = ref(false);
  const totpEnrollmentRequired = ref(false);
  const totpRecoveryRequested = ref(false);
  const loginCaptcha = ref<AuthApi.PointCaptchaChallenge>();
  let loginCaptchaUsername = '';
  let loginVerificationRequest = 0;
  let allowStoredSession = true;
  let restoreFlight:
    | undefined
    | {
        epoch: number;
        token: string;
        promise: Promise<'unavailable' | boolean>;
      };
  let sessionEpoch = 0;
  let languageEpoch = -1;
  let timezoneEpoch = -1;
  let languageLoginAt = Date.now();
  const languagePreferences = createLanguagePreferenceSync();
  const timezonePreferences = createTimezonePreferenceSync();
  const uiPreferences = createUIPreferenceSync();
  let uiPreferenceEpoch = -1;

  function selectUIPreferences(change: UserPreferenceChange) {
    uiPreferences.select(
      change,
      Boolean(accessStore.accessToken) &&
        !totpEnrollmentRequired.value &&
        !passwordResetRequired.value,
      captureSession(),
    );
  }

  function selectLanguage(language: string) {
    const isCurrent = captureSession();
    if (accessStore.accessToken && isCurrent()) browserSession.setLocale(language);
    const authenticated =
      Boolean(accessStore.accessToken) &&
      !totpEnrollmentRequired.value &&
      !passwordResetRequired.value;
    void languagePreferences
      .select(language, authenticated, isCurrent)
      .then(() => {
        if (authenticated && isCurrent()) {
          languageEpoch = sessionEpoch;
          if (userStore.userInfo)
            userStore.setUserInfo({ ...userStore.userInfo, language });
        }
      })
      .catch(() => {
        // Request client reports the write error; retain the immediate local selection.
        if (isCurrent()) languageEpoch = -1;
      });
  }

  function selectTimezone(timezone: string) {
    const isCurrent = captureSession();
    const authenticated =
      Boolean(accessStore.accessToken) &&
      !totpEnrollmentRequired.value &&
      !passwordResetRequired.value;
    void timezonePreferences
      .select(timezone, authenticated, isCurrent)
      .then(() => {
        if (authenticated && isCurrent()) {
          timezoneEpoch = sessionEpoch;
          if (userStore.userInfo)
            userStore.setUserInfo({ ...userStore.userInfo, timezone });
        }
      })
      .catch(() => {
        // Request client reports the write error; retain the immediate local selection.
        if (isCurrent()) timezoneEpoch = -1;
      });
  }

  function resetLoginVerification() {
    loginVerificationRequest += 1;
    loginCaptcha.value = undefined;
    loginCaptchaUsername = '';
  }

  function acceptLoginCaptcha(
    failure: AuthApi.LoginFailure | undefined,
    username: string,
  ) {
    if (!failure?.captcha_required || !failure.captcha) return false;
    // The operation's own response supersedes any optional preflight still in flight.
    loginVerificationRequest += 1;
    loginCaptcha.value = failure.captcha;
    loginCaptchaUsername = username.trim();
    return true;
  }

  async function checkLoginVerification(
    username: string,
    browserUUID?: string,
  ) {
    const request = ++loginVerificationRequest;
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      loginCaptcha.value = undefined;
      loginCaptchaUsername = '';
      return;
    }
    try {
      const verification = await getLoginVerificationApi(
        normalizedUsername,
        browserUUID,
      );
      if (request !== loginVerificationRequest) return;
      loginCaptcha.value = verification.captcha_required
        ? verification.captcha
        : undefined;
      loginCaptchaUsername = loginCaptcha.value ? normalizedUsername : '';
      return verification.email_code;
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
    let loginEpoch = sessionEpoch;
    try {
      loginVerificationRequest += 1;
      loginLoading.value = true;
      loginFailureMessage.value = '';
      loginFailureCode.value = '';
      const captcha = loginCaptcha.value;
      const result = await loginApi({
        ...params,
        captcha_id:
          params.method === 'email_code' ? undefined : captcha?.captcha_id,
        captcha_points:
          params.method !== 'email_code' && captcha
            ? params.captchaPoints
            : undefined,
        slider_proof:
          params.method === 'email_code' || captcha
            ? undefined
            : params.sliderProof,
      });
      if (loginEpoch !== sessionEpoch) return { userInfo };

      // 如果成功获取到 accessToken
      if (result.access_token) {
        languageLoginAt = Date.now();
        const accepting = acceptSession(result, false, undefined, true);
        setTOTPEnrollmentSource(
          params.method === 'email_code' ? 'email-login' : 'password-login',
        );
        loginEpoch = sessionEpoch;
        await accepting;
        recordLoginAccount(String(params.username ?? ''));
        if (totpEnrollmentRequired.value) {
          resetLoginVerification();
          accessStore.setLoginExpired(false);
          await router.replace({
            path: '/auth/bind-totp',
            query: loginRedirectQuery(router.currentRoute.value.fullPath),
          });
          return { userInfo };
        }
        if (passwordResetRequired.value) {
          resetLoginVerification();
          accessStore.setLoginExpired(false);
          await router.replace({
            path: '/auth/reset-password',
            query: loginRedirectQuery(router.currentRoute.value.fullPath),
          });
          return { userInfo };
        }

        userInfo = await continueLogin(true);
        if (loginEpoch !== sessionEpoch) return { userInfo: null };
        if (onSuccess && router.currentRoute.value.path !== '/auth/bind-email')
          await onSuccess();

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
      if (loginEpoch !== sessionEpoch) return { userInfo: null };
      if (params.method !== 'email_code' && isTransportFailure(error)) {
        showRequestErrorToast(error);
      } else {
        loginFailureMessage.value = requestErrorMessage(
          error,
          $t('email-auth.loginFailed'),
        );
      }
      const failure = getLoginFailure(error);
      loginFailureCode.value = failure?.error_code ?? '';
      acceptLoginCaptcha(failure, String(params.username ?? ''));
    } finally {
      if (loginEpoch === sessionEpoch) {
        loginLoading.value = false;
        loginEntering.value = false;
      }
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
    allowStoredSession = false;
    const pendingPreferences = uiPreferences.flush();
    const refreshToken = browserSession.latestToken(accessStore.refreshToken);
    const epoch = ++sessionEpoch;
    const ownedReturn = rememberAccountReturn(
      redirect ? router.currentRoute.value.fullPath : undefined,
    );
    const query =
      redirect && !ownedReturn
        ? loginRedirectQuery(router.currentRoute.value.fullPath)
        : {};
    // Reject verification waiters before the network round trip so no previous request
    // can continue verification while this session is signing out.
    cancelVerification();
    try {
      try {
        await pendingPreferences;
      } catch {
        /* Logout remains available after an optional save failure. */
      }
      if (refreshToken) {
        await logoutApi(refreshToken);
      }
    } catch {
      // 不做任何处理
    }
    if (epoch !== sessionEpoch) return;
    setTOTPEnrollmentSource();
    if (userCache.account !== undefined) rememberLoginPagePreferences();
    browserSession.end();
    releaseSessionCache();
    resetAllStores();
    resetLoginVerification();
    accessStore.setLoginExpired(false);

    // 回登录页带上当前路由地址
    await router.replace({
      path: LOGIN_PATH,
      query,
    });
  }

  async function openTOTPRecovery() {
    // Cancel the pending mutation, but keep this session for account recovery.
    const isCurrent = captureSession();
    cancelVerification();
    await router.push({ path: '/profile' });
    if (isCurrent() && router.currentRoute.value.path === '/profile')
      totpRecoveryRequested.value = true;
  }

  let userInfoFlight:
    | undefined
    | { epoch: number; request: ReturnType<typeof getUserInfoApi> };
  async function fetchUserInfo({
    fresh,
    ...feedback
  }: RequestErrorFeedback & { fresh?: boolean } = {}): Promise<
    Awaited<ReturnType<typeof getUserInfoApi>>
  > {
    const epoch = sessionEpoch;
    const previousFlight = userInfoFlight;
    if (previousFlight?.epoch === epoch) {
      if (!fresh) return previousFlight.request;
      // A write/403 can invalidate a request that started before the change.
      // Serialize behind it, then issue (or join) a request started afterwards.
      try {
        await previousFlight.request;
      } catch {
        /* Still refresh if this session is current. */
      }
      if (sessionEpoch !== epoch || !accessStore.accessToken)
        throw new Error('Permission response belongs to an expired session');
      if (userInfoFlight?.request === previousFlight.request)
        userInfoFlight = undefined;
      return fetchUserInfo(feedback);
    }
    const request = (async () => {
      const previousPaths = JSON.stringify(userStore.userInfo?.roles ?? []);
      const previousNavigation = JSON.stringify(
        (
          userStore.userInfo as Awaited<
            ReturnType<typeof getUserInfoApi>
          > | null
        )?.permission?.navigation,
      );
      const userInfo = await getUserInfoApi(feedback);
      const assertSession = () => {
        if (sessionEpoch !== epoch || !accessStore.accessToken)
          throw new Error('Permission response belongs to an expired session');
      };
      assertSession();
      if (languageEpoch !== epoch) {
        try {
          if (
            await languagePreferences.sync(
              userInfo.language,
              () => sessionEpoch === epoch && Boolean(accessStore.accessToken),
              languageLoginAt,
            )
          ) {
            languageEpoch = epoch;
            browserSession.setLocale(preferences.app.locale);
          }
        } catch {
          // A preference write must not turn successful authentication into a failed login.
          // Keep the pending selection so the next profile read can retry.
        }
        assertSession();
      }
      if (timezoneEpoch !== epoch) {
        try {
          if (
            await timezonePreferences.sync(
              userInfo.timezone,
              () => sessionEpoch === epoch && Boolean(accessStore.accessToken),
              languageLoginAt,
            )
          )
            timezoneEpoch = epoch;
        } catch {
          /* Optional timezone persistence must not fail authentication; retry on the next info read. */
        }
        assertSession();
      }
      if (uiPreferenceEpoch !== epoch) {
        try {
          const properties = await loadSystemProperties();
          assertSession();
          await uiPreferences.sync(
            userInfo.uiPreferences,
            () => sessionEpoch === epoch && Boolean(accessStore.accessToken),
            languageLoginAt,
            properties?.ui_preferences?.vben_pc,
          );
          uiPreferenceEpoch = epoch;
        } catch {
          /* Keep local edits for a later retry without blocking login. */
        }
        assertSession();
      }
      accessStore.setAccessCodes([
        ...userInfo.permission.words,
        ...userInfo.permission.menus.flatMap((menu) => menu.btns),
      ]);
      userStore.setUserInfo(userInfo);
      emailBindingRequired.value = userInfo.emailBindingRequired;
      if (
        accessStore.isAccessChecked &&
        (previousPaths !== JSON.stringify(userInfo.roles) ||
          previousNavigation !== JSON.stringify(userInfo.permission.navigation))
      ) {
        const [{ generateAccess }, { accessRoutes }] =
          await Promise.all([
            import('#/router/access'),
            import('#/router/routes'),
          ]);
        assertSession();
        const { accessibleMenus, accessibleRoutes } = await generateAccess({
          roles: userInfo.roles,
          router,
          routes: accessRoutes,
          permissionMenus: userInfo.permission.menus,
          navigation: userInfo.permission.navigation,
        });
        assertSession();
        accessStore.setAccessMenus(accessibleMenus);
        accessStore.setAccessRoutes(accessibleRoutes);
      }
      return userInfo;
    })();
    userInfoFlight = { epoch, request };
    try {
      return await request;
    } finally {
      if (userInfoFlight?.request === request) userInfoFlight = undefined;
    }
  }

  let onboardingReady = false;
  let onboardingFlight:
    | undefined
    | { epoch: number; token: string; promise: Promise<void> };
  async function syncOnboarding(feedback?: RequestErrorFeedback) {
    const epoch = sessionEpoch;
    const token = accessStore.accessToken;
    if (!token) throw new Error('No session for onboarding');
    if (onboardingFlight?.epoch === epoch && onboardingFlight.token === token)
      return onboardingFlight.promise;
    const promise = (async () => {
      const assertCurrent = () => {
        if (epoch !== sessionEpoch || token !== accessStore.accessToken)
          throw new Error('Onboarding response belongs to an expired session');
      };
      let requirements = await getOnboardingStatusApi(feedback);
      assertCurrent();
      const skipped = new Set<'password' | 'totp'>();
      while (true) {
        // Respect server ordering and acknowledge optional gates before hiding them.
        let step: 'password' | 'totp' | undefined;
        if (requirements.totp_enrollment_required) {
          if (
            requirements.totp_skip_allowed === true &&
            requirements.totp_onboarding_hidden === true
          ) {
            step = 'totp';
          }
        } else if (
          requirements.password_reset_required &&
          requirements.password_reset_skip_allowed === true &&
          requirements.password_reset_onboarding_hidden === true
        ) {
          step = 'password';
        }
        if (!step) break;
        if (skipped.has(step))
          throw new Error('Hidden onboarding step remains required');
        skipped.add(step);
        await skipOnboardingApi(step, feedback);
        assertCurrent();
        requirements = await getOnboardingStatusApi(feedback);
        assertCurrent();
      }
      emailOnboardingHidden.value =
        requirements.email_onboarding_hidden === true;
      passwordResetRequired.value = requirements.password_reset_required;
      passwordResetSkipAllowed.value =
        requirements.password_reset_skip_allowed === true;
      passwordResetByAdmin.value =
        requirements.password_reset_reason === 'admin_reset';
      totpSkipAllowed.value = requirements.totp_skip_allowed === true;
      totpEnrollmentRequired.value = requirements.totp_enrollment_required;
      emailBindingRequired.value = requirements.email_binding_required;
      if (passwordResetRequired.value || totpEnrollmentRequired.value) {
        accessStore.setIsAccessChecked(false);
        userStore.$reset();
      }
      onboardingReady = true;
    })();
    const pending = { epoch, token, promise };
    onboardingFlight = pending;
    try {
      await promise;
    } finally {
      if (onboardingFlight === pending) onboardingFlight = undefined;
    }
  }

  async function restoreSession() {
    if (accessStore.accessToken) {
      if (!onboardingReady) await syncOnboarding();
      return true;
    }
    const token = browserSession.latestToken(accessStore.refreshToken);
    if (token && token !== accessStore.refreshToken)
      accessStore.setRefreshToken(token);
    if (!allowStoredSession || !token) return false;
    const epoch = sessionEpoch;
    if (restoreFlight?.token === token && restoreFlight.epoch === epoch)
      return restoreFlight.promise;
    const flight = { epoch, token, promise: restoreFromToken(token) };
    restoreFlight = flight;
    try {
      return await flight.promise;
    } finally {
      if (restoreFlight === flight) restoreFlight = undefined;
    }
  }

  async function restoreFromToken(
    refreshToken: string,
  ): Promise<'unavailable' | boolean> {
    const isCurrent = captureSession();
    const savedLocale = browserSession.restorationLocale(refreshToken);
    const locale = savedLocale && resolveCatalogLocale(savedLocale);
    let result: AuthApi.LoginResult;
    try {
      result = await refreshTokenApi(refreshToken, locale);
    } catch (error) {
      if (!isCurrent() || accessStore.refreshToken !== refreshToken)
        return Boolean(accessStore.accessToken);
      if (!isUnauthorizedError(error)) {
        // Render the recovery screen without writing to the guest preference cache.
        if (locale) await loadLocaleMessages(locale).catch(() => {});
        return isCurrent() ? 'unavailable' : Boolean(accessStore.accessToken);
      }
      browserSession.end();
      releaseSessionCache();
      accessStore.setRefreshToken(null);
      accessStore.setAccessToken(null);
      if (locale)
        await loadLocaleMessages(preferences.app.locale).catch(() => {});
      return false;
    }
    if (!isCurrent() || accessStore.refreshToken !== refreshToken)
      return Boolean(accessStore.accessToken);
    await acceptSession(result);
    return true;
  }

  async function acceptSession(
    result: AuthApi.LoginResult,
    refreshCurrentSession = false,
    feedback?: RequestErrorFeedback,
    newLogin = false,
  ) {
    if (!accessStore.accessToken) languageLoginAt = Date.now();
    const sameTokens =
      accessStore.accessToken === result.access_token &&
      accessStore.refreshToken === result.refresh_token;
    if (sameTokens && onboardingReady && !newLogin) return;
    if (!refreshCurrentSession && !sameTokens) {
      uiPreferences.reset();
      sessionEpoch += 1;
      totpRecoveryRequested.value = false;
    }
    allowStoredSession = false;
    onboardingReady = false;
    browserSession.save(result.refresh_token, newLogin);
    if (newLogin && accessStore.isLockScreen) accessStore.unlockScreen();
    bindSessionCache(result.access_token);
    if (!refreshCurrentSession && !sameTokens) {
      // Binding the account may reset the locale. Apply its claimed login-page
      // choice before the request client reads preferences for onboarding.
      void languagePreferences
        .applyPendingSelection(languageLoginAt)
        .catch(() => {});
    }
    if (newLogin) browserSession.setLocale(preferences.app.locale);
    accessStore.setRefreshToken(result.refresh_token);
    accessStore.setAccessToken(result.access_token);
    await syncOnboarding(feedback);
  }

  async function requirePasswordReset() {
    await syncOnboarding();
    accessStore.setIsAccessChecked(false);
    await router.replace({
      path: totpEnrollmentRequired.value
        ? '/auth/bind-totp'
        : '/auth/reset-password',
      query: loginRedirectQuery(router.currentRoute.value.fullPath),
    });
  }

  async function completePasswordReset(newPassword: string) {
    const current = captureSession();
    const result = await resetPasswordApi(newPassword);
    if (!current()) return;
    await acceptSession(result);
    await continueLogin(true);
    notification.success({ message: $t('app.resetPassword.success') });
  }

  async function requireTOTPEnrollment() {
    await syncOnboarding();
    accessStore.setIsAccessChecked(false);
    await router.replace({
      path: '/auth/bind-totp',
      query: loginRedirectQuery(router.currentRoute.value.fullPath),
    });
  }

  async function skipOnboarding(step: 'password' | 'totp') {
    const isCurrent = captureSession();
    const feedback = step === 'totp' ? totpOnboardingFeedback : undefined;
    try {
      await skipOnboardingApi(step, feedback);
    } catch (error) {
      // Refresh policy even after a rejected or lost response; never clear a gate locally.
      if (isCurrent()) await syncOnboarding(feedback);
      throw error;
    }
    if (!isCurrent()) return;
    await syncOnboarding(feedback);
    if (isCurrent()) await continueLogin(true, feedback);
  }

  async function completeVerificationEnrollment(result: AuthApi.LoginResult) {
    await acceptSession(result, false, totpOnboardingFeedback);
    await continueLogin(true, totpOnboardingFeedback);
  }

  async function continueLogin(
    promptForEmail = false,
    feedback?: RequestErrorFeedback,
  ): Promise<null | UserInfoWithPermissions> {
    if (!onboardingReady) await syncOnboarding(feedback);
    const query = loginRedirectQuery(router.currentRoute.value.fullPath);
    if (totpEnrollmentRequired.value) {
      await router.replace({ path: '/auth/bind-totp', query });
      return null;
    }
    if (passwordResetRequired.value) {
      await router.replace({ path: '/auth/reset-password', query });
      return null;
    }
    setTOTPEnrollmentSource();
    const isCurrent = captureSession();
    // A long-lived login page may hold an unavailable or outdated public snapshot.
    // Revalidate before /info chooses its email fields and before entering the app.
    if (promptForEmail) await loadSystemProperties({ fresh: true });
    if (!isCurrent()) return null;
    const info = await fetchUserInfo({ fresh: true, ...feedback });
    const canOfferBinding =
      promptForEmail &&
      info.permission.profile_actions?.includes('bind_email') &&
      !emailOnboardingHidden.value &&
      !info.email &&
      !info.emailBindingSkipped &&
      !info.emailBindingRequired;
    const properties = canOfferBinding
      ? await loadSystemProperties()
      : undefined;
    const offerBinding = properties?.email_enabled;
    if (!isCurrent()) return null;
    emailBindingRequired.value = info.emailBindingRequired;
    const wasExpired = accessStore.loginExpired;
    if (info.emailBindingRequired || offerBinding) {
      await router.replace({ path: '/auth/bind-email', query });
      if (isCurrent()) accessStore.setLoginExpired(false);
      return info;
    }
    loginEntering.value = true;
    try {
      if (!wasExpired) await playLoginTransition();
      if (!isCurrent()) return null;
      userCache.anonymous('session').removeItem('email-login');
      await router.replace(
        loginDestination(info.permission, consumeAccountReturn(query.redirect)),
      );
      if (isCurrent()) accessStore.setLoginExpired(false);
    } finally {
      loginEntering.value = false;
    }
    return info;
  }

  async function completeEmailBinding(result: AuthApi.LoginResult) {
    await acceptSession(result);
    await continueLogin(false);
  }

  async function completeProfileEmailBinding(
    result: AuthApi.LoginResult,
    address: string,
  ) {
    await acceptSession(result);
    emailBindingRequired.value = false;
    // The bind has committed even if the subsequent profile read fails.
    const user = userStore.userInfo as null | UserInfoWithPermissions;
    if (user)
      userStore.setUserInfo({
        ...user,
        email: address,
        emailBindingRequired: false,
      });
    await fetchUserInfo({ fresh: true });
  }

  async function skipEmailBinding() {
    const isCurrent = captureSession();
    await skipEmailBindingApi();
    if (isCurrent()) await continueLogin(false);
  }

  async function requireEmailBinding() {
    const isCurrent = captureSession();
    const properties = await loadSystemProperties();
    if (!properties?.email_enabled || !isCurrent()) return;
    emailBindingRequired.value = true;
    await router.replace({
      path: '/auth/bind-email',
      query: loginRedirectQuery(router.currentRoute.value.fullPath),
    });
  }

  function captureSession() {
    const epoch = sessionEpoch;
    const current = browserSession.capture();
    const owner = userCache.capture();
    return () => epoch === sessionEpoch && current() && owner();
  }

  function $reset() {
    releaseSessionCache();
    uiPreferences.reset();
    sessionEpoch += 1;
    onboardingReady = false;
    onboardingFlight = undefined;
    pendingRegistrationLogin = null;
    setTOTPEnrollmentSource();
    cancelVerification();
    totpEnrollmentRequired.value = false;
    totpRecoveryRequested.value = false;
    emailOnboardingHidden.value = false;
    passwordResetRequired.value = false;
    passwordResetSkipAllowed.value = false;
    passwordResetByAdmin.value = false;
    totpSkipAllowed.value = false;
    loginLoading.value = false;
    loginFailureMessage.value = '';
    loginFailureCode.value = '';
    emailBindingRequired.value = false;
    loginEntering.value = false;
    resetLoginVerification();
  }

  return {
    $reset,
    selectLanguage,
    selectTimezone,
    selectUIPreferences,
    loginFailureMessage,
    loginFailureCode,
    emailBindingRequired,
    continueLogin,
    completeEmailBinding,
    completeProfileEmailBinding,
    skipEmailBinding,
    skipOnboarding,
    passwordResetSkipAllowed,
    passwordResetByAdmin,
    totpSkipAllowed,
    requireEmailBinding,
    acceptSession,
    rememberExpiredPage: () =>
      rememberAccountReturn(router.currentRoute.value.fullPath),
    captureSession,
    authLogin,
    completePasswordReset,
    passwordResetRequired,
    totpEnrollmentRequired,
    totpRecoveryRequested,
    requireTOTPEnrollment,
    completeVerificationEnrollment,
    requirePasswordReset,
    checkLoginVerification,
    acceptLoginCaptcha,
    fetchUserInfo,
    loginCaptcha,
    loginLoading,
    loginEntering,
    logout,
    openTOTPRecovery,
    refreshLoginCaptcha,
    resetLoginVerification,
    restoreSession,
    verifyLoginCaptcha,
  };
});

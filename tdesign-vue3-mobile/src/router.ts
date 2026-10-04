import { createRouter, createWebHistory } from 'vue-router';
import { nextTick, ref, watch } from 'vue';
import { canMenu, initializeSession, pendingRequests, session } from './lib/api';
export const routeLoading = ref(true);
export const routeSkeleton = ref(false);
let loadingGeneration = 0;
let initialNavigation = true;
let initialLoadingExpired = false;
// performance.now() is measured from navigation start, so this is a true
// document-level maximum rather than five seconds after the bundle executes.
const initialLoadingDeadline = 5000;
const initialLoadingTimer = window.setTimeout(
  () => {
    initialLoadingExpired = true;
    routeLoading.value = false;
    routeSkeleton.value = true;
  },
  Math.max(0, initialLoadingDeadline - performance.now()),
);

function finishInitialLoading() {
  window.clearTimeout(initialLoadingTimer);
  initialNavigation = false;
  routeLoading.value = false;
}

function waitForRequestsOrDeadline() {
  return new Promise<void>((resolve) => {
    let stop = () => {};
    const timeout = window.setTimeout(
      () => {
        stop();
        resolve();
      },
      Math.max(0, initialLoadingDeadline - performance.now()),
    );
    stop = watch(pendingRequests, (count) => {
      if (count) return;
      window.clearTimeout(timeout);
      stop();
      resolve();
    });
  });
}
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard/overview' },
    { path: '/auth', redirect: '/auth/login' },
    { path: '/dashboard', redirect: '/dashboard/overview' },
    { path: '/auth/login', component: () => import('./pages/AuthPage.vue') },
    { path: '/auth/register', component: () => import('./pages/AuthPage.vue') },
    { path: '/auth/reset-password', component: () => import('./pages/AuthPage.vue') },
    { path: '/dashboard/overview', component: () => import('./pages/OverviewPage.vue') },
    { path: '/dashboard/workspace', component: () => import('./pages/OverviewPage.vue') },
    { path: '/system', redirect: '/dashboard/overview?tab=manage' },
    ...['user', 'role', 'user-group', 'action', 'dictionary', 'whitelist'].map((resource) => ({
      path: `/system/${resource}`,
      component: () => import('./pages/ManagementPage.vue'),
      props: { resource },
    })),
    { path: '/msg/inbox', component: () => import('./pages/MsgPage.vue') },
    { path: '/system/msg', component: () => import('./pages/MsgPage.vue') },
    { path: '/profile', component: () => import('./pages/ProfilePage.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
  ],
});
router.beforeEach(async (to) => {
  loadingGeneration++;
  if (initialNavigation && !initialLoadingExpired) routeLoading.value = true;
  else routeSkeleton.value = true;
  await initializeSession();
  const publicPage = ['/auth/login', '/auth/register'].includes(to.path);
  if (!session.accessToken && !publicPage)
    return { path: '/auth/login', query: { redirect: to.fullPath } };
  if (session.accessToken && session.resetRequired && to.path !== '/auth/reset-password')
    return '/auth/reset-password';
  if (
    session.accessToken &&
    !session.resetRequired &&
    (publicPage || to.path === '/auth/reset-password')
  )
    return '/dashboard/overview';
  if (session.accessToken && to.path.startsWith('/system/') && !canMenu(to.path))
    return { path: '/dashboard/overview', query: { denied: '1' } };
  if (to.path === '/dashboard/workspace' && !canMenu(to.path)) return '/dashboard/overview';
});
router.afterEach(async () => {
  const current = loadingGeneration;
  await nextTick();
  if (!initialNavigation || initialLoadingExpired) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (current === loadingGeneration) {
      finishInitialLoading();
      routeSkeleton.value = false;
    }
    return;
  }
  // A routed component can start requests in onMounted or in its first paint.
  // Keep the full-page cover up until requests stay idle across two frames so
  // users never see the page assemble itself underneath them.
  while (current === loadingGeneration) {
    if (pendingRequests.value) {
      await waitForRequestsOrDeadline();
    }
    if (initialLoadingExpired) break;
    await nextTick();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (!pendingRequests.value) break;
  }
  if (current === loadingGeneration) {
    finishInitialLoading();
  }
});
router.onError(() => {
  finishInitialLoading();
  routeSkeleton.value = false;
});
window.addEventListener('cinch-session-ended', () => {
  void router.replace('/auth/login');
});
window.addEventListener('cinch-reset-required', () => {
  void router.replace('/auth/reset-password');
});

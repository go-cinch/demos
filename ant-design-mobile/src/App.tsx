import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { subscribe } from 'valtio';
import { Button, ConfigProvider, SearchBar } from 'antd-mobile';
import zhCN from 'antd-mobile/es/locales/zh-CN';
import enUS from 'antd-mobile/es/locales/en-US';
import {
  canMenu,
  getPendingRequests,
  initializeSession,
  session,
  logout,
  subscribePendingRequests,
} from './lib/api';
import { preferences as p } from './lib/preferences';
import { modules } from './lib/navigation';
import { locale, t, toggleLocale } from './locales';
import type { ResourceKind } from './lib/types';
import { Icon, IconButton, Sheet, Copyright, TextField, Loading, NoData } from './components/UI';
import PageSkeleton from './components/PageSkeleton';
import MsgBell from './components/MsgBell';
import Settings, { Choices } from './components/Settings';
const MsgPage = lazy(() => import('./pages/MsgPage'));
const Auth = lazy(() => import('./pages/AuthPage')),
  Overview = lazy(() => import('./pages/OverviewPage')),
  Management = lazy(() => import('./pages/ManagementPage')),
  Profile = lazy(() => import('./pages/ProfilePage'));
let revision = 0;
const listeners = new Set<() => void>();
for (const store of [session, p, locale])
  subscribe(store, () => {
    revision++;
    listeners.forEach((fn) => fn());
  });
const subscribeStores = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
interface Lock {
  hash: string;
  salt: string;
  userId: number;
}
function readLock(): Lock | null {
  try {
    return JSON.parse(sessionStorage.getItem('cinch-garnet-lock') || 'null');
  } catch {
    return null;
  }
}
async function digest(salt: string, password: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + password)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export default function App() {
  useSyncExternalStore(subscribeStores, () => revision);
  const pendingRequests = useSyncExternalStore(subscribePendingRequests, getPendingRequests);
  const location = useLocation(),
    navigate = useNavigate(),
    auth = location.pathname.startsWith('/auth/');
  const [settings, setSettings] = useState(false),
    [tools, setTools] = useState(false),
    [authTools, setAuthTools] = useState(false),
    [panel, setPanel] = useState(''),
    [query, setQuery] = useState(''),
    [lock, setLock] = useState<Lock | null>(readLock),
    [password, setPassword] = useState(''),
    [lockError, setLockError] = useState(''),
    [initialLoadingExpired, setInitialLoadingExpired] = useState(performance.now() >= 5000);
  const content = useRef<HTMLDivElement>(null);
  function clearLock() {
    setLock(null);
    try {
      sessionStorage.removeItem('cinch-garnet-lock');
    } catch {}
  }
  useEffect(() => {
    void initializeSession();
    const ended = () => {
      clearLock();
      setPanel('');
      navigate('/auth/login', { replace: true });
    };
    const reset = () => navigate('/auth/reset-password', { replace: true });
    window.addEventListener('cinch-session-ended', ended);
    window.addEventListener('cinch-reset-required', reset);
    return () => {
      window.removeEventListener('cinch-session-ended', ended);
      window.removeEventListener('cinch-reset-required', reset);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setInitialLoadingExpired(true),
      Math.max(0, 5000 - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!session.ready || pendingRequests) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        document.querySelector('#app-bootstrap-loading')?.remove();
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [session.ready, pendingRequests]);
  useEffect(() => {
    setTools(false);
    setAuthTools(false);
    content.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.search, session.ready, session.user?.id]);
  useEffect(() => {
    if (lock && session.user && lock.userId !== session.user.id) clearLock();
  }, [session.user?.id]);
  useEffect(() => {
    const openLock = () => {
      setPassword('');
      setLockError('');
      setPanel('lock');
    };
    window.addEventListener('cinch-lock-screen', openLock);
    return () => window.removeEventListener('cinch-lock-screen', openLock);
  }, []);
  if (!session.ready) return initialLoadingExpired ? <PageSkeleton /> : <Loading />;
  const publicPage = ['/auth/login', '/auth/register'].includes(location.pathname);
  if (!session.accessToken && !publicPage)
    return (
      <Navigate
        to={`/auth/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (session.accessToken && session.resetRequired && location.pathname !== '/auth/reset-password')
    return <Navigate to="/auth/reset-password" replace />;
  if (
    session.accessToken &&
    !session.resetRequired &&
    (publicPage || location.pathname === '/auth/reset-password')
  )
    return <Navigate to="/dashboard/overview" replace />;
  if (
    session.accessToken &&
    ((location.pathname.startsWith('/system/') && !canMenu(location.pathname)) ||
      (location.pathname === '/dashboard/workspace' && !canMenu(location.pathname)))
  )
    return <Navigate to="/dashboard/overview?denied=1" replace />;
  const active =
    location.pathname === '/profile'
      ? 'mine'
      : location.pathname.startsWith('/system/')
        ? 'manage'
        : new URLSearchParams(location.search).get('tab') || 'home';
  const go = (tab: string) => {
    navigate(
      tab === 'mine'
        ? '/profile'
        : tab === 'home'
          ? '/dashboard/overview'
          : `/dashboard/overview?tab=${tab}`,
    );
    setPanel('');
  };
  const searchEntries = [
    { path: '/dashboard/overview', label: t('home'), icon: 'home' },
    ...(canMenu('/dashboard/workspace')
      ? [{ path: '/dashboard/workspace', label: t('page.dashboard.workspace'), icon: 'app' }]
      : []),
    ...modules.value,
    { path: '/profile', label: t('page.auth.profile'), icon: 'user' },
  ].filter((x) => x.label.toLowerCase().includes(query.toLowerCase()));
  const routeSkeletonVariant = location.pathname.startsWith('/system/')
    ? 'management'
    : location.pathname.startsWith('/dashboard/')
      ? 'overview'
      : 'page';
  const routes = (
    <Suspense fallback={<PageSkeleton variant={routeSkeletonVariant} />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
        <Route path="/auth" element={<Navigate to="/auth/login" replace />} />
        <Route path="/dashboard" element={<Navigate to="/dashboard/overview" replace />} />
        {['login', 'register', 'reset-password'].map((mode) => (
          <Route key={mode} path={`/auth/${mode}`} element={<Auth key={mode} />} />
        ))}
        <Route path="/dashboard/overview" element={<Overview />} />
        <Route path="/dashboard/workspace" element={<Overview />} />
        <Route path="/system" element={<Navigate to="/dashboard/overview?tab=manage" replace />} />
        {(
          ['user', 'role', 'user-group', 'action', 'dictionary', 'whitelist'] as ResourceKind[]
        ).map((resource) => (
          <Route
            key={resource}
            path={`/system/${resource}`}
            element={<Management key={resource} resource={resource} />}
          />
        ))}
        <Route path="/msg/inbox" element={<MsgPage key="inbox" />} />
        <Route path="/system/msg" element={<MsgPage key="sent" />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="*"
          element={
            <div className="page">
              <NoData text={t('notFound')} />
              <Link to="/dashboard/overview">{t('home')}</Link>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
  async function setScreenLock() {
    if (!password.trim()) {
      setLockError(t('app.validation.password'));
      return;
    }
    const salt = crypto.randomUUID();
    const value = { salt, hash: await digest(salt, password), userId: session.user!.id };
    setLock(value);
    try {
      sessionStorage.setItem('cinch-garnet-lock', JSON.stringify(value));
    } catch {}
    setPassword('');
    setPanel('');
  }
  async function unlock() {
    if (lock && (await digest(lock.salt, password)) !== lock.hash) {
      setLockError(t('lockWrong'));
      return;
    }
    clearLock();
    setPassword('');
    setLockError('');
  }
  const brand = (
    <Link to="/" className="brand">
      <img src={p.dark ? '/go-cinch-white.svg' : '/go-cinch.svg'} alt="" />
      <span className="brand-wide">Go Cinch Admin by Ant Design Mobile</span>
      <span className="brand-narrow">Go Cinch Admin</span>
      <span className="brand-tiny">Go Cinch</span>
    </Link>
  );
  return (
    <ConfigProvider locale={locale.value === 'zh-CN' ? zhCN : enUS}>
      <a href="#main" className="skip-link">
        {t('home')}
      </a>
      {auth ? (
        <div className="studio auth-studio">
          <div className="device">
            <header className="auth-topbar">
              {brand}
              <div className="auth-tools-wrap">
                <IconButton
                  name={authTools ? 'close' : 'ellipsis'}
                  label={t('more')}
                  expanded={authTools}
                  controls="auth-tools-menu"
                  onClick={() => setAuthTools((value) => !value)}
                />
                {authTools && (
                  <div id="auth-tools-menu" className="auth-tools-menu">
                    <IconButton
                      name="palette"
                      label={t('color')}
                      onClick={() => {
                        setSettings(true);
                        setAuthTools(false);
                      }}
                    />
                    <IconButton
                      name="translate"
                      label={t('language')}
                      onClick={() => {
                        toggleLocale();
                        setAuthTools(false);
                      }}
                    />
                    <IconButton
                      name={p.dark ? 'sunny' : 'moon'}
                      label={t('theme')}
                      onClick={() => {
                        p.dark = !p.dark;
                        setAuthTools(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </header>
            <div className="app-scroll auth-content">{routes}</div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="studio"
            {...(lock ? ({ inert: '' } as Record<string, string>) : {})}
            aria-hidden={!!lock}
          >
            <div className="device">
              <header className="topbar">
                <Link to="/dashboard/overview" className="workspace">
                  <img
                    className="workspace-logo"
                    src={p.dark ? '/go-cinch-white.svg' : '/go-cinch.svg'}
                    alt=""
                  />
                  <span>
                    <strong>Go Cinch</strong>
                    <small>{session.user?.role?.name || t('workspace')}</small>
                  </span>
                </Link>
                <div className="top-tools">
                  <MsgBell />
                  <button
                    className="icon-button"
                    aria-label={t('more')}
                    aria-expanded={tools}
                    onClick={() => setTools((v) => !v)}
                  >
                    <Icon name="ellipsis" />
                  </button>
                </div>
              </header>
              {tools && (
                <>
                  <button
                    className="tools-dismiss"
                    aria-label={t('close')}
                    onClick={() => setTools(false)}
                  />
                  <nav className="shell-tools glass" aria-label={t('more')}>
                    <IconButton
                      name="search"
                      label={t('search')}
                      onClick={() => {
                        setQuery('');
                        setPanel('search');
                      }}
                    />
                    <IconButton
                      name="setting"
                      label={t('settings')}
                      onClick={() => setSettings(true)}
                    />
                    <IconButton name="moon" label={t('theme')} onClick={() => (p.dark = !p.dark)} />
                    <IconButton name="translate" label={t('language')} onClick={toggleLocale} />
                    <IconButton
                      name="time"
                      label={t('timezone')}
                      onClick={() => setPanel('timezone')}
                    />
                    <IconButton
                      name="notification"
                      label={t('app.msg.inbox')}
                      onClick={() => navigate('/msg/inbox')}
                    />
                    <IconButton
                      name="lock-on"
                      label={t('lock')}
                      onClick={() => {
                        setPassword('');
                        setLockError('');
                        setPanel('lock');
                      }}
                    />
                  </nav>
                </>
              )}
              <main ref={content} id="main" className="app-scroll">
                {routes}
                {p.footer && <Copyright />}
              </main>
              <nav className="dock glass" aria-label={t('workspace')}>
                {['home', 'manage', 'security', 'mine'].map((key, i) => (
                  <button
                    key={key}
                    className={active === key ? 'active' : ''}
                    aria-current={active === key ? 'page' : undefined}
                    onClick={() => go(key)}
                  >
                    <Icon name={['home', 'app', 'secured', 'user'][i]} size={20} />
                    <span>{t(key)}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
          {lock && (
            <div className="lock-screen">
              <form
                className="auth-panel"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void unlock();
                }}
              >
                <Icon name="lock-on" size={38} />
                <h1>{t('lock')}</h1>
                <TextField
                  name="unlock-password"
                  label={t('lockHint')}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  error={lockError}
                />
                <Button block color="primary" type="submit">
                  {t('unlock')}
                </Button>
                <button type="button" className="auth-link" onClick={() => void logout()}>
                  {t('logout')}
                </button>
              </form>
            </div>
          )}
        </>
      )}
      <Sheet
        open={!!panel}
        onClose={() => setPanel('')}
        title={t(panel === 'apps' ? 'allApps' : panel === 'loginPosition' ? 'panel' : panel)}
      >
        {['search', 'apps'].includes(panel) ? (
          <>
            <SearchBar
              className="app-search-bar"
              value={query}
              onChange={setQuery}
              placeholder={t('searchApps')}
              aria-label={t('searchApps')}
            />
            <nav className="app-grid">
              {searchEntries.map((x) => (
                <Link
                  key={x.path}
                  className="app-card card"
                  to={x.path}
                  onClick={() => setPanel('')}
                >
                  <Icon name={x.icon} />
                  <strong>{x.label}</strong>
                </Link>
              ))}
            </nav>
            {!searchEntries.length && <NoData text={t('noResults')} />}
          </>
        ) : panel === 'logout' ? (
          <>
            <p>{t('logoutConfirm')}</p>
            <div className="sheet-actions">
              <Button onClick={() => setPanel('')}>{t('cancel')}</Button>
              <Button color="danger" onClick={() => void logout()}>
                {t('logout')}
              </Button>
            </div>
          </>
        ) : panel === 'loginPosition' ? (
          <>
            <p className="notice">{t('desktopPositionHint')}</p>
            <Choices
              value={p.loginPosition}
              onChange={(v) => (p.loginPosition = String(v))}
              options={['left', 'center', 'right'].map((value) => ({ value, label: t(value) }))}
            />
          </>
        ) : panel === 'timezone' ? (
          <>
            <p className="notice">{t('timezoneHint', { zone: p.timezone })}</p>
            <Choices
              value={p.timezone}
              onChange={(v) => (p.timezone = String(v))}
              options={[
                'Asia/Shanghai',
                'UTC',
                'America/New_York',
                'Europe/London',
                'Asia/Tokyo',
              ].map((value) => ({ value, label: value }))}
            />
          </>
        ) : panel === 'lock' ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void setScreenLock();
            }}
          >
            <TextField
              name="lock-password"
              label={t('lockPassword')}
              value={password}
              onChange={setPassword}
              type="password"
              error={lockError}
            />
            <Button block type="submit" color="primary">
              {t('lock')}
            </Button>
          </form>
        ) : null}
      </Sheet>
      <Settings open={settings} onClose={() => setSettings(false)} showLoginPosition={false} />
    </ConfigProvider>
  );
}

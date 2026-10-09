import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SearchBar, Skeleton } from 'antd-mobile';
import { can, listResource, session } from '../lib/api';
import { modules } from '../lib/navigation';
import { dateTime, initials } from '../lib/format';
import type { RecordData } from '../lib/types';
import { t, locale } from '../locales';
import { Icon, ErrorBox, NoData } from '../components/UI';
import PageSkeleton from '../components/PageSkeleton';

type MockDevice = {
  id: number;
  name: string;
  platform: string;
  location: string;
  lastSeen: string;
  current?: boolean;
};

export default function OverviewPage() {
  const location = useLocation(),
    tab = new URLSearchParams(location.search).get('tab') || 'home';
  const workspace = location.pathname === '/dashboard/workspace';
  const [query, setQuery] = useState(''),
    [total, setTotal] = useState<number>(),
    [active, setActive] = useState(0),
    [pending, setPending] = useState(0),
    [locked, setLocked] = useState(0),
    [users, setUsers] = useState<RecordData[]>([]),
    [reviews, setReviews] = useState<RecordData[]>([]),
    [mockDevices, setMockDevices] = useState<MockDevice[]>([
      {
        id: 1,
        name: 'iPhone 15 Pro',
        platform: 'Mobile Safari · iOS 18',
        location: 'Shanghai',
        lastSeen: 'deviceActiveNow',
        current: true,
      },
      {
        id: 2,
        name: 'MacBook Pro',
        platform: 'Chrome · macOS',
        location: 'Shanghai',
        lastSeen: 'deviceActiveTwoHours',
      },
      {
        id: 3,
        name: 'Windows Workstation',
        platform: 'Edge · Windows 11',
        location: 'Hangzhou',
        lastSeen: 'deviceActiveYesterday',
      },
    ]),
    [loading, setLoading] = useState({
      recent: false,
      active: false,
      pending: false,
      locked: false,
    }),
    [failures, setFailures] = useState({ recent: '', active: '', pending: '', locked: '' }),
    [revision, setRevision] = useState(0);
  const allowed = can('user', 'read');
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const loadRegion = async (
      region: keyof typeof loading,
      params: Record<string, unknown>,
      apply: (result: Awaited<ReturnType<typeof listResource>>) => void,
    ) => {
      setLoading((current) => ({ ...current, [region]: true }));
      setFailures((current) => ({ ...current, [region]: '' }));
      try {
        const result = await listResource('user', params);
        if (!cancelled) apply(result);
      } catch (e) {
        if (!cancelled) setFailures((current) => ({ ...current, [region]: (e as Error).message }));
      } finally {
        if (!cancelled) setLoading((current) => ({ ...current, [region]: false }));
      }
    };
    void loadRegion('recent', { p: 1, s: 5 }, (result) => {
      setTotal(result.t);
      setUsers(result.items);
    });
    void loadRegion('active', { p: 1, s: 1, status: 1 }, (result) => setActive(result.t));
    void loadRegion('pending', { p: 1, s: 3, status: 0 }, (result) => {
      setPending(result.t);
      setReviews(result.items);
    });
    void loadRegion('locked', { p: 1, s: 1, status: 2 }, (result) => setLocked(result.t));
    return () => {
      cancelled = true;
    };
  }, [allowed, revision]);
  const error = Object.values(failures).find(Boolean) || '';
  const filtered = modules.value.filter((m) => m.label.toLowerCase().includes(query.toLowerCase()));
  const removeMockDevice = (id: number) =>
    setMockDevices((devices) => devices.filter((device) => device.id !== id || device.current));
  const lockScreen = () => window.dispatchEvent(new Event('cinch-lock-screen'));
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            {tab === 'home'
              ? new Date().toLocaleDateString(locale.value, {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })
              : t('workspace')}
          </p>
          <div className="page-title-row">
            <h1>
              {t(
                tab === 'home'
                  ? workspace
                    ? 'page.dashboard.workspace'
                    : 'page.dashboard.overview'
                  : tab,
              )}
            </h1>
            {tab === 'home' && (
              <span className="pill">
                <span className="dot" />
                {t('overviewHint')}
              </span>
            )}
          </div>
          {tab === 'home' && (
            <p className="lead">{t(workspace ? 'workspaceDescription' : 'overviewDescription')}</p>
          )}
          {tab !== 'home' && (
            <p className="lead">{t(tab === 'manage' ? 'manageHint' : 'securityHint')}</p>
          )}
        </div>
      </header>
      {new URLSearchParams(location.search).has('denied') && (
        <p role="alert" className="notice">
          {t('noAccessHint')}
        </p>
      )}
      <ErrorBox error={error} retry={() => setRevision((x) => x + 1)} />
      {tab === 'home' ? (
        <>
          {workspace && (
            <section className="metal-card">
              <div className="engraving" aria-hidden="true">
                C
              </div>
              <div className="pass-rule" />
              <div className="pass-top">
                <div>
                  <h2>{t('team')}</h2>
                  <p>GO CINCH · WORKSPACE</p>
                </div>
                <Icon name="secured" size={18} />
              </div>
              <div className="pass-bottom">
                <div className="pass-members">
                  <div className="avatars">
                    {(loading.recent ? [] : users).slice(0, 3).map((u) => (
                      <span key={u.id} className="mini-avatar">
                        {initials(u.username || '')}
                      </span>
                    ))}
                  </div>
                  <span>
                    {allowed
                      ? `${loading.recent ? '—' : (total ?? '—')} ${t('personUnit')}`
                      : session.user?.username}
                  </span>
                </div>
                <Link
                  className="pass-link"
                  to={allowed ? '/system/user' : '/profile'}
                  aria-label={t('view')}
                >
                  <Icon name="arrow" size={18} />
                </Link>
              </div>
            </section>
          )}
          {!workspace && allowed && (
            <div className="metrics">
              {[
                { value: active, label: 'system.status.active', status: 1 },
                { value: pending, label: 'system.status.pending', status: 0 },
                { value: locked, label: 'system.status.locked', status: 2 },
              ].map((x) => (
                <Link className="metric" key={x.status} to={`/system/user?status=${x.status}`}>
                  {loading[x.status === 1 ? 'active' : x.status === 0 ? 'pending' : 'locked'] ? (
                    <strong className="skeleton-label" aria-hidden="true">
                      0
                    </strong>
                  ) : (
                    <strong>{x.value}</strong>
                  )}
                  <span>{t(x.label)}</span>
                </Link>
              ))}
            </div>
          )}
          {!workspace && allowed && (
            <>
              <div className="section-heading">
                <h2>
                  {t('reviewQueue')} <span className="counter">{pending}</span>
                </h2>
                <Link to="/system/user?status=0">
                  {t('all')}
                  <Icon name="chevron-right" size={14} />
                </Link>
              </div>
              <div className="queue card">
                {loading.pending ? (
                  <PageSkeleton variant="list" listKind="queue" rows={reviews.length || 1} />
                ) : reviews.length ? (
                  reviews.map((u) => (
                    <Link
                      className="queue-row"
                      key={u.id}
                      to={`/system/user?username=${encodeURIComponent(u.username || '')}&status=0`}
                    >
                      <span className="avatar">{initials(u.username || '')}</span>
                      <span className="record-main">
                        <strong>{u.username}</strong>
                        <small>
                          {String(
                            u.metadata?.department || u.role?.name || t('system.status.pending'),
                          )}
                        </small>
                      </span>
                      <span className="review-button">{t('system.user.review')}</span>
                    </Link>
                  ))
                ) : (
                  <p className="caught-up">
                    <Icon name="check" size={18} />
                    {t('caughtUp')}
                  </p>
                )}
              </div>
            </>
          )}
          <div className="section-heading">
            <h2>{t('common')}</h2>
            <Link to="/dashboard/overview?tab=manage">
              {t('allApps')}
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>
          <div className="quick-grid">
            {modules.value
              .filter((x) => ['user', 'role', 'user-group', 'dictionary'].includes(x.resource))
              .slice(0, 4)
              .map((m) => (
                <Link key={m.path} to={m.path}>
                  <span className="quick-icon">
                    <Icon name={m.icon} size={24} />
                  </span>
                  <span>{m.label}</span>
                </Link>
              ))}
          </div>
          <Link to="/dashboard/overview?tab=security" className="activity-preview">
            <Icon name="secured" size={16} />
            <span>{t('sessionHint')}</span>
          </Link>
          {allowed && (
            <>
              <div className="section-heading">
                <h2>{t('recent')}</h2>
                <Link to="/system/user">
                  {t('all')}
                  <Icon name="chevron-right" size={14} />
                </Link>
              </div>
              <section className="card recent-record-list" aria-busy={loading.recent}>
                {loading.recent ? (
                  <PageSkeleton variant="list" listKind="recent" rows={users.length || 5} />
                ) : users.length ? (
                  users.map((user) => (
                    <Link
                      className="recent-record"
                      key={user.id}
                      to={`/system/user?username=${encodeURIComponent(user.username || '')}`}
                    >
                      <span className="avatar">{initials(user.username || '')}</span>
                      <span className="record-main">
                        <strong>{user.username}</strong>
                        <small>{dateTime(user.created_at)}</small>
                      </span>
                      <Icon name="chevron-right" size={16} />
                    </Link>
                  ))
                ) : (
                  !failures.recent && <NoData text={t('noData')} />
                )}
              </section>
            </>
          )}
          <p className="page-note">{t('materialNote')}</p>
        </>
      ) : tab === 'manage' ? (
        <>
          <SearchBar
            className="app-search-bar"
            value={query}
            onChange={setQuery}
            placeholder={t('searchApps')}
            aria-label={t('searchApps')}
          />
          <div className="app-grid manage-grid">
            {filtered.map((m) => (
              <Link className="app-card card" key={m.path} to={m.path}>
                <span className="quick-icon">
                  <Icon name={m.icon} size={26} />
                </span>
                <strong>{m.label}</strong>
              </Link>
            ))}
          </div>
          {!filtered.length && <NoData text={t('noResults')} />}
        </>
      ) : (
        <>
          <div className="section-heading security-section-heading">
            <h2>{t('loginDevices')}</h2>
            <span className="resource-tag blue">{t('mockData')}</span>
          </div>
          <section className="card device-list">
            {mockDevices.map((device) => (
              <div className="device-row" key={device.id}>
                <span className="device-icon">
                  <Icon name={device.current ? 'mobile' : 'layout'} />
                </span>
                <span className="device-main">
                  <strong>{device.name}</strong>
                  <small>
                    {device.platform} · {device.location}
                  </small>
                  <small>{t(device.lastSeen)}</small>
                </span>
                {device.current ? (
                  <span className="resource-tag green">{t('currentDevice')}</span>
                ) : (
                  <button className="device-remove" onClick={() => removeMockDevice(device.id)}>
                    {t('removeDevice')}
                  </button>
                )}
              </div>
            ))}
            <p className="device-mock-hint">{t('deviceMockHint')}</p>
          </section>
          <div className="section-heading">
            <h2>{t('deviceProtection')}</h2>
          </div>
          <section className="card">
            <button className="menu-row" onClick={lockScreen}>
              <Icon name="secured" />
              <span>
                {t('lock')}
                <small>{t('lockActionHint')}</small>
              </span>
            </button>
          </section>
        </>
      )}
    </div>
  );
}

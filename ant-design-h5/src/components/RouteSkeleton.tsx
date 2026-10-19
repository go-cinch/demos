import { Button, Input, SearchBar } from 'antd-mobile';
import '../pages/MsgInboxPage.css';
import { skeletonContext } from '../lib/skeleton-route';
import { configs } from '../lib/resource-config';
import { modules } from '../lib/navigation';
import { can, session } from '../lib/api';
import { locale, t } from '../locales';
import { Icon, Field, Copyright } from './UI';
import ResultToolbar from './ResultToolbar';
import RecordPagination from './RecordPagination';
import RecordListSkeleton, { SkeletonText } from './RecordListSkeleton';
const noop = () => {};
export default function RouteSkeleton({ path, search = '' }: { path: string; search?: string }) {
  const context = skeletonContext(path, new URLSearchParams(search).get('tab') || 'home');
  const config = context.resource ? configs.value[context.resource] : undefined;
  const primary =
    config?.filters.find((x) => x.type === 'input') ||
    config?.filters.find((x) => x.key === 'resource') ||
    config?.filters[0];
  const mode = context.mode === 'reset-password' ? 'password_reset' : context.mode;
  const dashboard = ['overview', 'workspace', 'applications', 'security'].includes(context.kind);
  const heading =
    config?.title ||
    t(
      context.messages
        ? 'app.msg.manage'
        : context.kind === 'applications'
          ? 'manage'
          : context.kind === 'workspace'
            ? 'page.dashboard.workspace'
            : context.kind === 'security'
              ? 'security'
              : context.kind === 'profile'
                ? 'mine'
                : context.kind === 'inbox'
                  ? 'app.msg.inbox'
                  : 'page.dashboard.overview',
    );
  const allowed = !session.ready || can('user', 'read');
  const applicationItems =
    modules.value.length || session.ready
      ? modules.value
      : Array.from({ length: 7 }, (_, index) => ({
          path: `skeleton-${index}`,
          resource: ['user', 'role', 'user-group', 'action', 'dictionary', 'whitelist', 'msg'][
            index
          ],
          label: '\u00a0'.repeat(8),
        }));
  const ghostSection = (label: string) => (
    <div className="section-heading">
      <h2>{t(label)}</h2>
      <a>
        {t('all')}
        <Icon name="chevron-right" size={14} />
      </a>
    </div>
  );
  return (
    <div
      className={`${context.kind === 'auth' ? 'auth-page' : 'page'} ${context.kind === 'management' ? 'management' : context.kind === 'inbox' ? 'message-page ant-message-inbox' : ''} route-skeleton`}
      data-skeleton-kind={context.kind}
      data-skeleton-path={path}
      role="status"
      aria-busy="true"
      aria-label={t('loading')}
    >
      <div
        className="route-skeleton-content"
        aria-hidden="true"
        {...({ inert: '' } as Record<string, string>)}
      >
        {context.kind === 'auth' ? (
          <section className="auth-panel">
            <p className="eyebrow">CINCH · {t('moon')}</p>
            <h1>
              {t(
                mode === 'login'
                  ? 'loginTitle'
                  : mode === 'register'
                    ? 'registerTitle'
                    : 'app.resetPassword.title',
              )}
            </h1>
            <p className="lead">
              {t(
                mode === 'login'
                  ? 'loginHint'
                  : mode === 'register'
                    ? 'registerHint'
                    : 'app.resetPassword.description',
              )}
            </p>
            <form>
              {mode !== 'password_reset' && (
                <Field name="skeleton-username" label={t('system.fields.username')} required>
                  <Input disabled value="" placeholder={t('app.validation.username')} />
                </Field>
              )}
              <Field
                name="skeleton-password"
                label={t(
                  mode === 'password_reset'
                    ? 'system.fields.newPassword'
                    : 'system.fields.password',
                )}
                required
              >
                <Input
                  disabled
                  type="password"
                  value=""
                  placeholder={t('app.validation.password')}
                />
              </Field>
              {mode !== 'login' && (
                <Field
                  name="skeleton-confirmation"
                  label={t('page.profile.password.confirmPassword')}
                  required
                >
                  <Input
                    disabled
                    type="password"
                    value=""
                    placeholder={t('app.validation.password')}
                  />
                </Field>
              )}
              {mode !== 'password_reset' && (
                <Field name="skeleton-verification" label={t('app.captcha.additional')}>
                  <div>
                    <div className="slider-track skeleton-fill" />
                    <p className="slider-keyboard-hint">{t('sliderKeyboard')}</p>
                  </div>
                </Field>
              )}
              <Button block color="primary" disabled>
                {t(
                  mode === 'login'
                    ? 'page.auth.login'
                    : mode === 'register'
                      ? 'page.auth.register'
                      : 'app.resetPassword.submit',
                )}
              </Button>
              <span className="auth-link">
                {t(
                  mode === 'login' ? 'registerLink' : mode === 'register' ? 'loginLink' : 'logout',
                )}
              </span>
            </form>
          </section>
        ) : (
          <>
            <header className="page-heading">
              {context.kind === 'inbox' && (
                <span className="back-link">
                  <Icon name="chevron-left" size={22} />
                </span>
              )}
              {context.kind === 'management' && (
                <span className="back-link">
                  <Icon name="chevron-left" size={16} />
                </span>
              )}
              {context.kind === 'inbox' ? (
                <>
                  <h1>{heading}</h1>
                  <span className="icon-button message-read-all">
                    <Icon name="broom" size={23} />
                  </span>
                </>
              ) : (
                <div>
                  {dashboard || context.kind === 'profile' ? (
                    <p className="eyebrow">
                      {context.kind === 'overview'
                        ? new Date().toLocaleDateString(locale.value, {
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long',
                          })
                        : t('workspace')}
                    </p>
                  ) : null}
                  {dashboard ? (
                    <div className="page-title-row">
                      <h1>{heading}</h1>
                      {['overview', 'workspace'].includes(context.kind) && (
                        <span className="pill">
                          <span className="dot" />
                          {t('overviewHint')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <h1>{heading}</h1>
                  )}
                  {(dashboard || context.kind === 'profile') && (
                    <p className="lead">
                      {t(
                        context.kind === 'applications'
                          ? 'manageHint'
                          : context.kind === 'security'
                            ? 'securityHint'
                            : context.kind === 'profile'
                              ? 'profileHint'
                              : context.kind === 'workspace'
                                ? 'workspaceDescription'
                                : 'overviewDescription',
                      )}
                    </p>
                  )}
                </div>
              )}

              {context.resource && (
                <Icon
                  name={
                    context.resource === 'user'
                      ? 'usergroup'
                      : context.resource === 'role'
                        ? 'secured'
                        : context.resource === 'dictionary'
                          ? 'book'
                          : 'app'
                  }
                  size={26}
                />
              )}
            </header>
            {context.kind === 'applications' ? (
              <>
                <SearchBar className="app-search-bar" placeholder={t('searchApps')} value="" />
                <div className="app-grid manage-grid">
                  {applicationItems.map((item) => (
                    <div className="app-card card" key={item.path}>
                      <span className="quick-icon skeleton-fill" />
                      <strong className="skeleton-label">{item.label}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : context.kind === 'management' ? (
              <>
                <section className="search-region">
                  <div className="search-field">
                    {primary ? (
                      <>
                        <label className="sr-only">{primary.label}</label>
                        <div className="search-input">
                          <Icon name="search" size={18} />
                          <Input
                            disabled
                            value=""
                            placeholder={t('system.common.enter', { field: primary.label })}
                          />
                        </div>
                      </>
                    ) : (
                      <Field name="skeleton-msg-type" label={t('app.msg.type')}>
                        <div className="select-trigger">{t('app.msg.allTypes')}</div>
                      </Field>
                    )}
                  </div>
                  {context.resource === 'user' && (
                    <div className="segmented status-segmented">
                      {[
                        'all',
                        'system.status.active',
                        'system.status.pending',
                        'system.status.locked',
                      ].map((key) => (
                        <button disabled key={key}>
                          {t(key)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="search-actions">
                    <button disabled>{t('system.common.more')}</button>
                    <button disabled>
                      <Icon name="refresh" size={14} />
                      {t('system.common.reset')}
                    </button>
                    <button className="search-submit" disabled>
                      <Icon name="search" size={14} />
                      {t('system.common.search')}
                    </button>
                  </div>
                </section>
                <div className="results-region">
                  <ResultToolbar refresh={noop} options={noop}>
                    {(context.messages ||
                      (context.resource && can(context.resource, 'create'))) && (
                      <Button
                        className="create-record skeleton-action"
                        size="small"
                        color="primary"
                        disabled
                      >
                        <Icon name="add" size={16} />
                        <span>{t(context.messages ? 'app.msg.send' : 'system.common.create')}</span>
                      </Button>
                    )}
                  </ResultToolbar>
                  <div className="selection-tools">
                    <div className="selection-actions">
                      <div className="action-chip skeleton-action">
                        <Icon name="check-rectangle" size={16} />
                        <span>{t('select')}</span>
                      </div>
                    </div>
                    <span className="result-count">
                      <SkeletonText width="60px" />
                    </span>
                  </div>
                  <RecordListSkeleton
                    resource={context.resource}
                    kind={context.messages ? 'sent' : 'resource'}
                  />
                  <RecordPagination
                    page={1}
                    size={20}
                    total={0}
                    loading
                    change={noop}
                    options={noop}
                  />
                </div>
              </>
            ) : context.kind === 'overview' || context.kind === 'workspace' ? (
              <>
                {context.kind === 'workspace' && (
                  <section className="metal-card">
                    <div className="pass-top">
                      <div>
                        <h2>{t('team')}</h2>
                        <p>GO CINCH · WORKSPACE</p>
                      </div>
                      <Icon name="secured" size={18} />
                    </div>
                    <div className="pass-bottom">
                      <div className="pass-avatars">
                        <span className="skeleton-fill avatar" />
                        <span>
                          <SkeletonText width="90px" />
                        </span>
                      </div>
                      <Icon name="arrow" size={18} />
                    </div>
                  </section>
                )}
                {context.kind === 'overview' && allowed && (
                  <div className="metrics">
                    {['active', 'pending', 'locked'].map((key) => (
                      <a className="metric" key={key}>
                        <strong className="skeleton-label">0</strong>
                        <span>{t(`system.status.${key}`)}</span>
                      </a>
                    ))}
                  </div>
                )}
                {context.kind === 'overview' && allowed && (
                  <>
                    {ghostSection('reviewQueue')}
                    <div className="queue card">
                      <RecordListSkeleton kind="queue" rows={1} />
                    </div>
                  </>
                )}
                <div className="section-heading">
                  <h2>{t('common')}</h2>
                  <a>
                    {t('allApps')}
                    <Icon name="chevron-right" size={14} />
                  </a>
                </div>
                <div className="quick-grid">
                  {applicationItems
                    .filter((x) =>
                      ['user', 'role', 'user-group', 'dictionary'].includes(x.resource),
                    )
                    .slice(0, 4)
                    .map((item) => (
                      <a key={item.path}>
                        <span className="quick-icon skeleton-fill" />
                        <span className="skeleton-label">{item.label}</span>
                      </a>
                    ))}
                </div>
                <div className="activity-preview">
                  <Icon name="secured" size={16} />
                  <span>{t('sessionHint')}</span>
                </div>
                {allowed && (
                  <>
                    {ghostSection('recent')}
                    <section className="card recent-record-list">
                      <RecordListSkeleton kind="recent" />
                    </section>
                  </>
                )}
                <p className="page-note">{t('materialNote')}</p>
              </>
            ) : context.kind === 'security' ? (
              <>
                <div className="section-heading security-section-heading">
                  <h2>{t('loginDevices')}</h2>
                  <span className="resource-tag blue">{t('mockData')}</span>
                </div>
                <section className="card device-list">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div className="device-row" key={index}>
                      <span className="device-icon skeleton-fill" />
                      <span className="device-main">
                        <strong>
                          <SkeletonText width="112px" />
                        </strong>
                        <small>
                          <SkeletonText width="140px" />
                        </small>
                        <small>
                          <SkeletonText width="90px" />
                        </small>
                      </span>
                      <SkeletonText width="44px" />
                    </div>
                  ))}
                  <p className="device-mock-hint">{t('deviceMockHint')}</p>
                </section>
                <div className="section-heading">
                  <h2>{t('deviceProtection')}</h2>
                </div>
                <section className="card">
                  <div className="menu-row">
                    <Icon name="secured" />
                    <span>
                      {t('lock')}
                      <small>{t('lockActionHint')}</small>
                    </span>
                  </div>
                </section>
              </>
            ) : context.kind === 'profile' ? (
              <>
                <section className="profile-card metal-card">
                  <span className="avatar large skeleton-fill" />
                  <div>
                    <h2>
                      <SkeletonText width="136px" />
                    </h2>
                    <p>
                      <SkeletonText width="80px" />
                    </p>
                    <small>
                      <SkeletonText width="112px" />
                    </small>
                  </div>
                </section>
                <h2 className="section-title">{t('page.auth.profile')}</h2>
                <section className="card">
                  {['profile', 'password'].map((key) => (
                    <div className="menu-row" key={key}>
                      <Icon name={key === 'profile' ? 'user' : 'lock-on'} />
                      <span>{t(key)}</span>
                      <Icon name="chevron-right" size={18} />
                    </div>
                  ))}
                </section>
                <div className="about">
                  <span>Cinch · {t('moon')}</span>
                  <small>Ant Design Mobile</small>
                </div>
                <Button block color="danger" fill="outline" disabled>
                  {t('logout')}
                </Button>
              </>
            ) : context.kind === 'inbox' ? (
              <>
                <section className="message-filters">
                  <div className="message-type-tabs">
                    {['allTypes', 'system', 'notice'].map((key) => (
                      <button disabled key={key}>
                        {t(`app.msg.${key}`)}
                      </button>
                    ))}
                  </div>
                </section>
                <div className="results-region">
                  <RecordListSkeleton kind="message" />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
      {context.kind === 'auth' && <Copyright />}
    </div>
  );
}

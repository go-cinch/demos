'use client';
import { cn } from '@/lib/utils';
import { useAdminNow } from '@/features/admin/clock';
import InboxComponent from '@/features/messages/inbox-feed';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AButton,
  AdminDrawer,
  useAdminText,
  useAdminTimezone,
  useAdminIdentity,
  panelClass,
  mutedClass
} from '@/features/system/components/admin-ui';
import { auditProfileFields } from '@/features/admin/field-selectors';
import { getAuditList } from '@/features/admin/service';
import { adminDate, type AuditEvent } from '@/features/admin/model';
import { msgApi, msgChanged, type Msg } from '@/features/messages/api/service';
export default function ProfileCenter({ children }: { children: ReactNode }) {
  const text = useAdminText(),
    user = useAdminIdentity(),
    [tab, setTab] = useState('overview'),
    [inbox, setInbox] = useState(false);
  const tabs = ['overview', 'account', 'security'];
  const nav = useRef<HTMLDivElement>(null);
  const all = user?.permission.permission_scope === '*';
  const features = [
    ['/dashboard/overview', 'system-insights.overview'],
    ['/system/user', 'system.menu.users'],
    ['/system/role', 'system.menu.roles'],
    ['/system/user-group', 'system.menu.groups'],
    ['/system/action', 'system.menu.actions'],
    ['/system/dictionary', 'system.menu.dictionary'],
    ['/system/whitelist', 'system.menu.whitelist'],
    ['/system/msg', 'msg.manage'],
    ['/audit/login', 'audit.login'],
    ['/audit/operation', 'audit.operation']
  ].filter(
    ([path]) =>
      path === '/dashboard/overview' ||
      user?.permission.menus.includes('*') ||
      user?.permission.menus.includes(path)
  );
  return (
    <div
      className='grid items-start gap-5 xl:grid-cols-[248px_minmax(0,1fr)]'
      data-testid='profile-center'
    >
      <aside className={panelClass} data-testid='profile-identity'>
        <div className='text-center'>
          <div className='mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10 text-3xl text-primary'>
            {user?.username.slice(0, 1).toLocaleUpperCase()}
          </div>
          <h2 className='mt-4 text-xl font-semibold'>{user?.username}</h2>
          <p className={cn(mutedClass, 'my-2')}>{user?.role?.name ?? '—'}</p>
          <code className='break-all text-xs'>{user?.code}</code>
          <div className='my-4'>
            <AButton active onClick={() => setInbox(true)}>
              {text('profile-center.openInbox')}
            </AButton>
          </div>
        </div>
        <dl className='space-y-3 border-y py-4 text-sm'>
          <div>
            <dt className={mutedClass}>{text('profile-center.accountId')}</dt>
            <dd>{user?.id}</dd>
          </div>
          <div>
            <dt className={mutedClass}>{text('profile-center.permissionScope')}</dt>
            <dd>
              {text(all ? 'profile-center.allPermissions' : 'profile-center.assignedPermissions')}
            </dd>
          </div>
        </dl>
        <div
          ref={nav}
          role='tablist'
          tabIndex={-1}
          aria-orientation='vertical'
          className='mt-4 grid gap-2'
          onKeyDown={(event) => {
            const direction = (
              { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
            )[event.key];
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? 2
                  : direction === undefined
                    ? -1
                    : (tabs.indexOf(tab) + direction + tabs.length) % tabs.length;
            if (next < 0) return;
            event.preventDefault();
            setTab(tabs[next]);
            const buttons = nav.current?.querySelectorAll<HTMLButtonElement>('[role=tab]');
            buttons?.[next]?.focus();
          }}
        >
          {tabs.map((value) => (
            <button
              role='tab'
              type='button'
              key={value}
              id={`profile-tab-${value}`}
              aria-controls={`profile-panel-${value}`}
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              className='rounded-lg p-3 text-start text-sm aria-selected:bg-primary/10 aria-selected:text-primary'
              onClick={() => setTab(value)}
            >
              {text(`profile-center.${value}`)}
            </button>
          ))}
        </div>
      </aside>
      <div className='min-w-0'>
        <section id={`profile-panel-${tab}`} role='tabpanel' aria-labelledby={`profile-tab-${tab}`}>
          {tab === 'overview' ? (
            <ProfileOverview onInbox={() => setInbox(true)} />
          ) : tab === 'account' ? (
            <section className={panelClass} data-testid='profile-account'>
              <h2 className='text-lg font-semibold'>{text('profile-center.account')}</h2>
              <dl className='my-6 grid gap-5 sm:grid-cols-2'>
                {[
                  ['profile-center.accountId', user?.id],
                  ['profile-center.accountCode', user?.code],
                  ['system.fields.username', user?.username],
                  ['system.fields.role', user?.role?.name]
                ].map(([key, value]) => (
                  <div key={String(key)}>
                    <dt className={mutedClass}>{text(String(key))}</dt>
                    <dd className='mt-2 break-words'>{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              <h3 className='mb-3 border-t pt-5 font-semibold'>
                {text('profile-center.accessibleFeatures')}
              </h3>
              <div className='flex flex-wrap gap-2'>
                {features.map(([path, key]) => (
                  <span key={path} className='rounded border px-2 py-1 text-sm'>
                    {text(key)}
                  </span>
                ))}
              </div>
            </section>
          ) : (
            <section className={panelClass}>
              <h2 className='mb-4 text-lg font-semibold'>{text('profile-center.security')}</h2>
              <p className='mb-5 rounded-lg border border-amber-500/40 p-3 text-sm'>
                {text('profile-center.passwordNotice')}
              </p>
              {children}
            </section>
          )}
        </section>
      </div>
      <AdminDrawer bare open={inbox} title={text('msg.feedCenter')} onClose={() => setInbox(false)}>
        <InboxComponent onClose={() => setInbox(false)} />
      </AdminDrawer>
    </div>
  );
}
export function ProfileOverview({ onInbox }: { onInbox: () => void }) {
  const now = useAdminNow();
  const text = useAdminText(),
    zone = useAdminTimezone(),
    user = useAdminIdentity();
  const [kind, setKind] = useState<'login' | 'operation'>('login'),
    [activity, setActivity] = useState<AuditEvent[]>([]),
    [activityLoading, setActivityLoading] = useState(false),
    [activityError, setActivityError] = useState(false),
    [retryActivity, setRetryActivity] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([]),
    [unread, setUnread] = useState<number>(),
    [messagesLoading, setMessagesLoading] = useState(true),
    [messagesError, setMessagesError] = useState(false),
    [retryMessages, setRetryMessages] = useState(0),
    [selected, setSelected] = useState<Msg>(),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(false),
    [busy, setBusy] = useState(false);
  const detailRun = useRef(0);
  const kinds = useMemo(
    () =>
      (['login', 'operation'] as const).filter((value) =>
        user?.permission.permission_scope === '*' || user?.permission.menus.includes(`/audit/${value}`)
      ),
    [user?.permission]
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    if (!kinds.includes(kind) && kinds.length) setKind(kinds[0]);
  }, [kinds, kind]);
  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setActivity([]);
    setActivityError(false);
    if (!user || !kinds.includes(kind)) return;
    setActivityLoading(true);
    const to = Date.now();
    getAuditList(kind, {
      f: auditProfileFields[kind],
      username: user.username,
      from: to - 30 * 86400000,
      to,
      p: 1,
      s: 6,
      sort: 'newest',
      time_zone: zone
    })
      .then((data) => {
        if (active) setActivity(data.items);
      })
      .catch(() => {
        if (active) setActivityError(true);
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, user?.username, kinds, kind, zone, retryActivity]);
  useEffect(() => {
    let active = true,
      run = 0;
    if (!user) return;
    async function load() {
      if (document.hidden) return;
      const current = ++run;
      setMessagesLoading(true);
      setMessagesError(false);
      try {
        const [list, status] = await Promise.all([
          msgApi.list(false, {
            f: 'id,title,type,published_at,read_at',
            p: 1,
            s: 3
          }),
          msgApi.count(user?.id)
        ]);
        if (active && run === current) {
          setMessages(list.items);
          setUnread(status.count);
        }
      } catch {
        if (active && run === current) {
          setMessagesError(true);
          setUnread(undefined);
        }
      } finally {
        if (active && run === current) setMessagesLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener('cinch-msg-changed', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      run++;
      detailRun.current++;
      clearInterval(timer);
      window.removeEventListener('cinch-msg-changed', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [user?.id, retryMessages]);
  async function openMessage(row: Msg) {
    const run = ++detailRun.current;
    setSelected(row);
    setDetailLoading(true);
    setDetailError(false);
    try {
      const data = await msgApi.get(row.id, false);
      if (run !== detailRun.current) return;
      setSelected(data);
      if (!data.read_at) {
        await msgApi.read(data.id);
        msgChanged();
        if (run === detailRun.current) setSelected({ ...data, read_at: now });
      }
    } catch {
      if (run === detailRun.current) setDetailError(true);
    } finally {
      if (run === detailRun.current) setDetailLoading(false);
    }
  }
  async function readAll() {
    if (busy || !unread) return;
    setBusy(true);
    try {
      await msgApi.readAll();
      msgChanged();
    } catch {
      setMessagesError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className='space-y-5'>
      <section className={panelClass} data-testid='profile-messages'>
        <div className='mb-4 flex flex-wrap justify-between gap-3'>
          <h2 className='text-lg font-semibold'>
            {text('msg.inbox')} {unread ? `(${unread})` : ''}
          </h2>
          <AButton disabled={!unread || busy} onClick={() => void readAll()}>
            {text('msg.readAll')}
          </AButton>
        </div>
        {messagesLoading ? (
          <div className='h-40 animate-pulse rounded bg-muted' />
        ) : messagesError ? (
          <div role='alert'>
            {text('msg.error')}
            <AButton onClick={() => setRetryMessages((value) => value + 1)}>
              {text('msg.retry')}
            </AButton>
          </div>
        ) : messages.length ? (
          <div className='divide-y'>
            {messages.map((row) => (
              <button
                type='button'
                className='flex w-full items-start justify-between gap-4 py-4 text-start'
                key={row.id}
                onClick={() => void openMessage(row)}
              >
                <span>
                  <span className='me-2 rounded border px-2 py-1 text-xs'>
                    {text(`msg.${row.type}`)}
                  </span>
                  <strong className={!row.read_at ? 'font-semibold' : 'font-normal'}>
                    {row.title}
                  </strong>
                </span>
                <time className='shrink-0 text-xs opacity-60'>
                  {adminDate(row.published_at, zone)}
                </time>
              </button>
            ))}
          </div>
        ) : (
          <p className={mutedClass}>{text('msg.empty')}</p>
        )}
        <div className='mt-4 border-t pt-4'>
          <AButton onClick={onInbox}>{text('profile-center.openInbox')}</AButton>
        </div>
      </section>
      <section className={panelClass} data-testid='profile-activity'>
        <div className='mb-4 flex flex-wrap justify-between gap-3'>
          <h2 className='text-lg font-semibold'>{text('profile-center.recentActivity')}</h2>
          <div className='flex gap-2'>
            {kinds.map((value) => (
              <AButton key={value} active={kind === value} onClick={() => setKind(value)}>
                {text(`profile-center.${value}`)}
              </AButton>
            ))}
          </div>
        </div>
        <p className={cn(mutedClass, 'mb-3')}>
          {text('profile-center.activityRange', { count: 6 })}
        </p>
        {!kinds.length ? (
          <p>{text('profile-center.noActivityAccess')}</p>
        ) : activityLoading ? (
          <div className='h-56 animate-pulse rounded bg-muted' />
        ) : activityError ? (
          <div role='alert'>
            {text('audit.loadError')}
            <AButton onClick={() => setRetryActivity((value) => value + 1)}>
              {text('audit.retry')}
            </AButton>
          </div>
        ) : activity.length ? (
          <div className='divide-y'>
            {activity.map((row) => (
              <div key={row.id} className='flex flex-wrap justify-between gap-3 py-4 text-sm'>
                <div>
                  <strong>
                    {kind === 'login'
                      ? text(
                          row.status < 400
                            ? 'profile-center.loginSuccess'
                            : 'profile-center.loginFailure'
                        )
                      : row.operation
                        ? text(`audit.operationTypes.${row.operation}`)
                        : row.method}
                  </strong>
                  <p className={mutedClass}>
                    {row.ip} · {kind === 'operation' ? row.path : row.user_agent}
                  </p>
                </div>
                <time className='text-xs opacity-60'>{adminDate(row.occurred_at, zone)}</time>
              </div>
            ))}
          </div>
        ) : (
          <p>{text('profile-center.noActivity')}</p>
        )}
        {kinds.length > 0 &&
          (user?.permission.menus.includes('*') ||
            user?.permission.menus.includes(`/audit/${kind}`)) && (
            <a
              className='mt-4 inline-block text-primary hover:underline'
              href={`/audit/${kind}?username=${encodeURIComponent(user?.username ?? '')}&days=30`}
            >
              {text('profile-center.viewAudit')}
            </a>
          )}
      </section>
      <AdminDrawer
        open={!!selected}
        title={text('msg.detail')}
        onClose={() => {
          detailRun.current++;
          setSelected(undefined);
        }}
      >
        {detailLoading ? (
          <div className='h-48 animate-pulse rounded bg-muted' />
        ) : detailError ? (
          <div role='alert'>
            {text('msg.detailError')}
            {selected && (
              <AButton onClick={() => void openMessage(selected)}>{text('msg.retry')}</AButton>
            )}
          </div>
        ) : (
          selected && (
            <>
              <h2 className='mb-3 text-xl font-semibold'>{selected.title}</h2>
              <time className={mutedClass}>{adminDate(selected.published_at, zone)}</time>
              <div className='mt-5 whitespace-pre-wrap break-words'>{selected.content}</div>
            </>
          )
        )}
      </AdminDrawer>
    </div>
  );
}

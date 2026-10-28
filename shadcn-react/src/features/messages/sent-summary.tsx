'use client';
import { useStatisticsWarning } from '@/features/admin/statistics-warning';
import { useEffect, useState } from 'react';
import { msgApi, type MsgSentSummary } from '@/features/messages/api/service';
import {
  AButton,
  useAdminText,
  useAdminTimezone,
  panelClass,
  mutedClass
} from '@/features/system/components/admin-ui';
import { adminDate } from '@/features/admin/model';
export default function SentSummary({ allowed, revision }: { allowed: boolean; revision: number }) {
  const text = useAdminText(),
    zone = useAdminTimezone(),
    [data, setData] = useState<MsgSentSummary>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const showWarning = useStatisticsWarning(error);
  useEffect(() => {
    let active = true,
      run = 0;
    if (!allowed) return;
    async function load() {
      if (document.hidden) return;
      const current = ++run;
      setLoading(true);
      setError(false);
      try {
        const value = await msgApi.sentSummary();
        if (active && current === run) setData(value);
      } catch {
        if (active && current === run) {
          setData(undefined);
          setError(true);
        }
      } finally {
        if (active && current === run) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, 30000);
    window.addEventListener('cinch-msg-changed', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      run++;
      clearInterval(timer);
      window.removeEventListener('cinch-msg-changed', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [allowed, revision, retry]);
  if (!allowed) return null;
  return (
    <div
      className='grid gap-4 lg:grid-cols-3'
      data-testid='message-sent-summary'
      aria-busy={loading}
    >
      {showWarning && (
        <div role='alert' className={panelClass}>
          {text('msg.summaryError')}
          <AButton onClick={() => setRetry((value) => value + 1)}>{text('msg.retry')}</AButton>
        </div>
      )}
      <section className={panelClass}>
        <h2 className={mutedClass}>{text('msg.publishedCount')}</h2>
        <strong className='my-2 block text-3xl tabular-nums'>
          {loading || error ? '—' : (data?.total ?? 0)}
        </strong>
        <p className={mutedClass}>
          {text('msg.latestPublished')}: {adminDate(data?.counts.latest_published_at, zone)}
        </p>
      </section>
      {[
        ['type', 'notice', 'system'],
        ['scope', 'all', 'targeted']
      ].map(([label, first, second]) => {
        const counts = data?.counts as Record<string, number | null> | undefined;
        return (
          <section key={label} className={panelClass}>
            <h2 className={mutedClass}>{text(`msg.${label}`)}</h2>
            <div className='my-2 flex items-baseline gap-3'>
              <strong className='text-3xl tabular-nums'>
                {loading || error ? '—' : (counts?.[first] ?? 0)}
              </strong>
              <span className={mutedClass}>
                {text(`msg.${first}`)} / {error ? '—' : (counts?.[second] ?? 0)}{' '}
                {text(`msg.${second}`)}
              </span>
            </div>
            <div
              className='mt-4 flex h-2 overflow-hidden rounded bg-muted'
              role='img'
              aria-label={text(
                label === 'type' ? 'msg.typeDistribution' : 'msg.scopeDistribution',
                { [first]: counts?.[first] ?? 0, [second]: error ? '—' : (counts?.[second] ?? 0) }
              )}
            >
              <span
                className='bg-primary'
                style={{
                  width: `${data?.total ? (100 * Number(counts?.[first] ?? 0)) / data.total : 0}%`
                }}
              />
              <span
                className='bg-purple-500'
                style={{
                  width: `${data?.total ? (100 * Number(counts?.[second] ?? 0)) / data.total : 0}%`
                }}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

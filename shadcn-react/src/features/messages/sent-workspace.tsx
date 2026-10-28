'use client';
import { cn } from '@/lib/utils';
import { useAdminNow } from '@/features/admin/clock';
import { useEffect, useState } from 'react';
import { msgApi, type Msg } from '@/features/messages/api/service';
import {
  AButton,
  ACheck,
  useAdminText,
  useAdminTimezone,
  mutedClass
} from '@/features/system/components/admin-ui';
import { adminDate } from '@/features/admin/model';
export default function SentWorkspace({
  rows,
  loading,
  checked,
  onCheck,
  onView,
  onDelete,
  visible,
  density
}: {
  rows: Msg[];
  loading: boolean;
  checked: number[];
  onCheck: (ids: number[]) => void;
  onView: (row: Msg) => void;
  onDelete?: (row: Msg) => void;
  visible: string[];
  density: string;
}) {
  const now = useAdminNow();
  const text = useAdminText(),
    zone = useAdminTimezone(),
    [id, setId] = useState<number>(),
    [detail, setDetail] = useState<Msg>(),
    [detailLoading, setDetailLoading] = useState(false),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    if (!rows.some((row) => row.id === id)) setId(rows[0]?.id);
  }, [rows, id]);
  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize the local view with its remote query or controlled preference.
    setDetail(undefined);
    setError(false);
    if (!id) return;
    setDetailLoading(true);
    msgApi
      .get(id, true)
      .then((row) => {
        if (active) setDetail(row);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  if (loading && !rows.length)
    return <div className='h-96 animate-pulse rounded bg-muted' aria-busy='true' />;
  if (!rows.length) return <p className='py-16 text-center'>{text('msg.empty')}</p>;
  return (
    <div
      className='grid gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(0,1.5fr)]'
      data-testid='message-sent-workspace'
    >
      <section
        className='max-h-[660px] overflow-auto rounded border'
        data-testid='message-sent-list'
        aria-label={text('msg.publishedRecords')}
      >
        <div className='sticky top-0 flex items-center gap-3 border-b bg-card p-3'>
          <ACheck
            label={text('msg.selectAll')}
            checked={rows.every((row) => checked.includes(row.id))}
            disabled={loading}
            onChange={(value) => onCheck(value ? rows.map((row) => row.id) : [])}
          />
          <strong className='text-sm'>{text('msg.publishedRecords')}</strong>
        </div>
        {rows.map((row) => (
          <article
            key={row.id}
            className='flex items-start gap-3 border-b p-4'
            data-testid={`message-sent-item-${row.id}`}
          >
            <ACheck
              label={`${text('msg.select')} ${row.title}`}
              checked={checked.includes(row.id)}
              disabled={loading}
              onChange={(value) =>
                onCheck(
                  value ? [...new Set([...checked, row.id])] : checked.filter((id) => id !== row.id)
                )
              }
            />
            <button
              type='button'
              className='min-w-0 flex-1 text-start aria-pressed:text-primary'
              aria-pressed={row.id === id}
              onClick={() => setId(row.id)}
            >
              <div className='flex flex-wrap gap-2 text-xs opacity-70'>
                {visible.includes('type') && (
                  <span className='rounded border px-2 py-1'>{text(`msg.${row.type}`)}</span>
                )}
                {visible.includes('scope') && (
                  <span className='rounded border px-2 py-1'>{text(`msg.${row.scope}`)}</span>
                )}
                {row.expired_at && row.expired_at <= now && <span>{text('msg.expired')}</span>}
              </div>
              <strong className='mt-3 block break-words text-sm'>{row.title}</strong>
              {density !== 'compact' && (
                <p className={cn(mutedClass, 'mt-2 line-clamp-2 break-words')}>{row.summary}</p>
              )}
              {visible.includes('published_at') && (
                <time className='mt-3 block text-xs opacity-60'>
                  {adminDate(row.published_at, zone)}
                </time>
              )}
            </button>
          </article>
        ))}
      </section>
      <section
        className='max-h-[660px] overflow-auto rounded border p-5'
        data-testid='message-sent-preview'
        aria-label={text('msg.preview')}
        aria-busy={detailLoading}
      >
        <header className='mb-5 flex items-center justify-between gap-2'>
          <h2 className='font-semibold'>{text('msg.preview')}</h2>
          {detail && <AButton onClick={() => onView(detail)}>{text('msg.detail')}</AButton>}
        </header>
        {detailLoading ? (
          <div className='h-64 animate-pulse rounded bg-muted' />
        ) : error ? (
          <div role='alert'>
            {text('msg.detailError')}
            <AButton onClick={() => setRetry((value) => value + 1)}>{text('msg.retry')}</AButton>
          </div>
        ) : detail ? (
          <>
            <div className='flex flex-wrap gap-2 text-xs'>
              <span className='rounded border px-2 py-1'>{text(`msg.${detail.type}`)}</span>
              <span className='rounded border px-2 py-1'>{text(`msg.${detail.scope}`)}</span>
            </div>
            <h3 className='my-4 break-words text-xl font-semibold'>{detail.title}</h3>
            <p className={mutedClass}>
              {text('msg.published')}: {adminDate(detail.published_at, zone)} · {text('msg.sender')}
              : {detail.sender_id ?? '—'}
            </p>
            <div className='my-6 whitespace-pre-wrap break-words text-sm leading-7'>
              {detail.content}
            </div>
            <section className='rounded-lg border p-4'>
              <h4 className='mb-3 font-semibold'>
                {text('msg.scope')}: {text(`msg.${detail.scope}`)}
              </h4>
              {detail.scope === 'all' ? (
                <p className={mutedClass}>{text('msg.broadcastHint')}</p>
              ) : (
                <>
                  <p className={mutedClass}>
                    {text('msg.recipientCount', { count: detail.recipients?.length ?? detail.recipient_ids?.length ?? 0 })}
                  </p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    {detail.recipients?.length ? (
                      detail.recipients.map((recipient) => (
                        <span className='rounded border px-2 py-1 text-xs' key={recipient.id}>
                          {recipient.username} · {recipient.code}
                        </span>
                      ))
                    ) : (
                      <p className={mutedClass}>{text('msg.recipientsUnavailable')}</p>
                    )}
                  </div>
                </>
              )}
            </section>
            <footer className='mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
              <span className={mutedClass}>
                {text('msg.expiry')}:{' '}
                {detail.expired_at ? adminDate(detail.expired_at, zone) : text('msg.noExpiry')}
              </span>
              {onDelete && (
                <AButton onClick={() => onDelete(detail)}>{text('msg.deleteGlobal')}</AButton>
              )}
            </footer>
          </>
        ) : (
          <p>{text('msg.selectPreview')}</p>
        )}
      </section>
    </div>
  );
}

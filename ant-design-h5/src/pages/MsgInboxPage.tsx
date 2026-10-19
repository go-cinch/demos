import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { InfiniteScroll, SwipeAction, type SwipeActionRef } from 'antd-mobile';
import { useMessageFeed } from '../lib/use-message-feed';
import { msgApi, msgChanged, type Msg } from '../lib/msg';
import { dateTime } from '../lib/format';
import { t } from '../locales';
import { Icon, ErrorBox, NoData } from '../components/UI';
import PageSkeleton from '../components/PageSkeleton';
import './MsgInboxPage.css';
const tr = (key: string) => t(`app.msg.${key}`);

function MessageRow({
  row,
  busy,
  reading,
  deleting,
  open,
  reveal,
  close,
  remove,
  read,
}: {
  row: Msg;
  busy: boolean;
  reading: boolean;
  deleting: boolean;
  open: boolean;
  reveal: () => void;
  close: () => void;
  remove: () => void;
  read: () => void;
}) {
  const swipe = useRef<SwipeActionRef>(null);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    mouse: boolean;
    moved: boolean;
    open: boolean;
  }>();
  const suppressClick = useRef(false),
    feedbackTimer = useRef<number>();
  const [pressed, setPressed] = useState(false),
    [tapped, setTapped] = useState(false);
  useEffect(() => {
    if (!open) swipe.current?.close();
  }, [open]);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  useEffect(() => {
    const cancelOnScroll = () => {
      if (!pointer.current) return;
      pointer.current = undefined;
      suppressClick.current = true;
      setPressed(false);
    };
    window.addEventListener('scroll', cancelOnScroll, true);
    return () => window.removeEventListener('scroll', cancelOnScroll, true);
  }, []);
  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (busy) return;
    if (!event.isPrimary || event.button !== 0) {
      pointer.current = undefined;
      suppressClick.current = true;
      setPressed(false);
      return;
    }
    suppressClick.current = false;
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mouse: event.pointerType === 'mouse',
      moved: false,
      open,
    };
    if (event.pointerType === 'mouse') event.currentTarget.setPointerCapture(event.pointerId);
    setTapped(false);
    setPressed(!open);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
      start.moved = true;
      setPressed(false);
    }
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    pointer.current = undefined;
    setPressed(false);
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    suppressClick.current = start.moved || Math.hypot(dx, dy) > 8 || start.open;
    if (!busy && start.mouse && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) swipe.current?.show('right');
      else swipe.current?.close();
    }
  }
  function tap(event: MouseEvent<HTMLButtonElement>) {
    if (busy || (event.detail > 0 && suppressClick.current)) return;
    if (open) {
      swipe.current?.close();
      return;
    }
    setTapped(true);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setTapped(false), 640);
    if (!row.read_at) read();
  }
  return (
    <article
      className={`message-item ${!row.read_at ? 'is-unread' : ''} ${open ? 'is-revealed' : ''}`}
      data-record-id={row.id}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (busy) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          swipe.current?.show('right');
        } else if (event.key === 'ArrowRight' || event.key === 'Escape') {
          event.preventDefault();
          swipe.current?.close();
        }
      }}
    >
      <SwipeAction
        ref={swipe}
        closeOnAction={false}
        onActionsReveal={(side) => {
          if (side === 'right') reveal();
        }}
        onClose={close}
        rightActions={[
          {
            key: 'delete',
            color: 'danger',
            text: (
              <span className="message-delete-label">
                <Icon name="delete" size={19} />
                <span>{tr('delete')}</span>
                <span className="sr-only"> {row.title}</span>
              </span>
            ),
            onClick: remove,
          },
        ]}
        aria-busy={deleting}
      >
        <button
          type="button"
          className={`message-body ${pressed ? 'is-pressed' : ''} ${tapped ? 'is-tapped' : ''}`}
          aria-label={`${row.title}, ${tr(row.read_at ? 'read' : 'unread')}`}
          aria-disabled={busy}
          aria-busy={reading}
          onClick={tap}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            pointer.current = undefined;
            suppressClick.current = true;
            setPressed(false);
          }}
          onKeyDown={(event) => {
            if (!busy && !open && (event.key === 'Enter' || event.key === ' ')) {
              setTapped(false);
              setPressed(true);
            }
          }}
          onKeyUp={() => setPressed(false)}
          onBlur={() => setPressed(false)}
        >
          <span className="message-avatar" aria-hidden="true">
            <Icon name={row.type === 'system' ? 'secured' : 'notification'} size={24} />
            {!row.read_at && <span className="message-unread-dot" />}
          </span>
          <span className="message-main">
            <strong className="message-title">{row.title}</strong>
            <span className="message-preview">{row.content}</span>
          </span>
          <time className="message-time" aria-label={tr('published')}>
            {dateTime(row.published_at)}
          </time>
        </button>
      </SwipeAction>
    </article>
  );
}

export default function MsgInboxPage() {
  const [type, setType] = useState('');
  const feed = useMessageFeed(true, type, 20);
  const [busy, setBusy] = useState(false),
    [readingID, setReadingID] = useState<number | null>(null),
    [deletingID, setDeletingID] = useState<number | null>(null),
    [openID, setOpenID] = useState<number | null>(null);
  const sending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setOpenID(null);
    void feed.load();
  }, [feed.load]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !sending.current) void feed.load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('cinch-msg-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cinch-msg-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [feed.load]);
  async function readAll() {
    if (sending.current || feed.loading) return;
    sending.current = true;
    setBusy(true);
    setOpenID(null);
    feed.setError('');
    let failure = '';
    try {
      await msgApi.readAll();
    } catch (error) {
      failure = (error as Error).message;
    } finally {
      msgChanged();
      await feed.load();
      sending.current = false;
      if (mounted.current) {
        if (failure) feed.setError(failure);
        setBusy(false);
      }
    }
  }
  async function remove(row: Msg) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setDeletingID(row.id);
    feed.setError('');
    try {
      await msgApi.remove(row.id, false);
      if (mounted.current) setOpenID(null);
      msgChanged();
      await feed.load();
    } catch (error) {
      if (mounted.current) feed.setError((error as Error).message);
    } finally {
      sending.current = false;
      if (mounted.current) {
        setBusy(false);
        setDeletingID(null);
      }
    }
  }
  async function read(row: Msg) {
    if (sending.current || row.read_at) return;
    sending.current = true;
    setBusy(true);
    setReadingID(row.id);
    feed.setError('');
    try {
      await msgApi.read(row.id);
      msgChanged();
      await feed.load();
    } catch (error) {
      if (mounted.current) feed.setError((error as Error).message);
    } finally {
      sending.current = false;
      if (mounted.current) {
        setBusy(false);
        setReadingID(null);
      }
    }
  }
  return (
    <section
      className="page message-page ant-message-inbox"
      data-testid="message-inbox-page"
      aria-busy={feed.loading}
    >
      <header className="page-heading">
        <Link to="/profile" className="back-link" aria-label={t('mine')}>
          <Icon name="chevron-left" size={22} />
        </Link>
        <h1>{tr('inbox')}</h1>
        <button
          className="icon-button message-read-all"
          aria-label={tr('readAll')}
          title={tr('readAll')}
          disabled={feed.loading || busy}
          aria-busy={busy && deletingID === null && readingID === null}
          onClick={() => void readAll()}
        >
          <Icon name="broom" size={23} />
        </button>
      </header>
      <section className="message-filters" aria-label={tr('type')}>
        <div className="message-type-tabs" role="group" aria-label={tr('type')}>
          {['', 'system', 'notice'].map((value) => (
            <button
              key={value}
              className={type === value ? 'active' : ''}
              aria-pressed={type === value}
              disabled={busy}
              onClick={() => setType(value)}
            >
              {tr(value || 'allTypes')}
            </button>
          ))}
        </div>
      </section>
      <div className="results-region">
        <ErrorBox error={feed.error} retry={() => void feed.load()} />
        {feed.loading ? (
          <PageSkeleton variant="list" listKind="message" rows={feed.rows.length || 5} />
        ) : (
          <div className="message-list">
            {feed.rows.map((row) => (
              <MessageRow
                key={row.id}
                row={row}
                busy={busy}
                reading={readingID === row.id}
                deleting={deletingID === row.id}
                open={openID === row.id}
                reveal={() => setOpenID(row.id)}
                close={() => setOpenID((current) => (current === row.id ? null : current))}
                remove={() => void remove(row)}
                read={() => void read(row)}
              />
            ))}
            {!feed.rows.length && !feed.error && <NoData text={tr('empty')} />}
          </div>
        )}
        {!feed.loading && !feed.error && (
          <InfiniteScroll
            className={!feed.loadingMore && !feed.moreError ? 'message-infinite-idle' : ''}
            loadMore={feed.loadMore}
            hasMore={feed.hasMore && !feed.refreshing && !feed.moreError && !busy}
          >
            {() =>
              feed.moreError ? (
                <div className="message-load-error" role="alert">
                  <span>{feed.moreError}</span>
                  <button
                    className="action-chip action-chip-quiet"
                    onClick={() => void feed.loadMore()}
                  >
                    {tr('retry')}
                  </button>
                </div>
              ) : feed.loadingMore ? (
                tr('loadingMore')
              ) : null
            }
          </InfiniteScroll>
        )}
      </div>
    </section>
  );
}

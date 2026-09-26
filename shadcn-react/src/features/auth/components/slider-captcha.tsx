'use client';

import { IconCheck, IconChevronsRight } from '@tabler/icons-react';
import { request } from '@/features/auth/api';
import { useLocale } from '@/features/i18n/locale-context';
import { cn } from '@/lib/utils';
import * as React from 'react';

interface SliderCaptchaProps {
  purpose: 'login' | 'register';
  username: string;
  onUsernameResolved?: (username: string) => void;
  onVerified: (proof: string) => void;
}

interface DragState {
  pointerId: number;
  username: string;
  started: number;
  offset: number;
  width: number;
  distance: number;
  tracks: Array<{ t: number; x: number }>;
  challenge: Promise<{ captcha_id: string }>;
}

const THUMB_WIDTH = 44;
const MAX_TRACKS = 127;

export function SliderCaptcha({
  purpose,
  username,
  onUsernameResolved,
  onVerified
}: SliderCaptchaProps) {
  const { pick } = useLocale();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const valueRef = React.useRef(0);
  const [value, setValue] = React.useState(0);
  const [verified, setVerified] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const updateValue = React.useCallback((next: number) => {
    const normalized = Math.max(0, Math.min(100, next));
    valueRef.current = normalized;
    setValue(normalized);
  }, []);

  const reset = React.useCallback(
    (message = '') => {
      dragRef.current = null;
      updateValue(0);
      setBusy(false);
      setError(message);
    },
    [updateValue]
  );

  function currentUsername() {
    if (username.trim()) return username.trim();
    const form = trackRef.current?.closest('form');
    const field = form?.elements.namedItem('username');
    return field instanceof HTMLInputElement ? field.value.trim() : '';
  }

  function createChallenge(subject: string) {
    const challenge = request<{ captcha_id: string }>(
      '/auth/pub/slider/challenge',
      {
        method: 'POST',
        body: JSON.stringify({ purpose, username: subject })
      },
      false
    );
    void challenge.catch(() => undefined);
    return challenge;
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (busy || verified || event.button !== 0) return;
    const subject = currentUsername();
    if (!subject) {
      setError(pick('Enter your username first', '请先输入用户名'));
      return;
    }
    if (subject !== username.trim()) onUsernameResolved?.(subject);

    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const width = Math.round(rect.width - THUMB_WIDTH);
    if (width < 160) {
      setError(pick('The verification control is too narrow', '验证控件宽度不足'));
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const started = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      username: subject,
      started,
      offset: Math.max(0, Math.min(THUMB_WIDTH, event.clientX - rect.left)),
      width,
      distance: 0,
      tracks: [{ t: 0, x: 0 }],
      challenge: createChallenge(subject)
    };
    setError('');
    updateValue(0);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const distance = Math.max(
      0,
      Math.min(drag.width, Math.round(event.clientX - rect.left - drag.offset))
    );
    drag.distance = distance;
    if (drag.tracks.length < MAX_TRACKS) {
      drag.tracks.push({
        t: Math.max(0, Math.round(performance.now() - drag.started)),
        x: distance
      });
    }
    updateValue((distance / drag.width) * 100);
  }

  async function completeDrag(drag: DragState) {
    if (drag.distance < drag.width * 0.95 || valueRef.current < 95) {
      reset(pick('Please drag the slider to the end', '请将滑块拖到最右侧'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      const challenge = await drag.challenge;
      const duration = Math.max(1, Math.round(performance.now() - drag.started));
      const tracks = [...drag.tracks, { t: duration, x: drag.width }];
      const result = await request<{ proof: string }>(
        '/auth/pub/slider/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            captcha_id: challenge.captcha_id,
            distance: drag.width,
            duration_ms: duration,
            purpose,
            tracks,
            username: drag.username,
            width: drag.width
          })
        },
        false
      );
      onVerified(result.proof);
      setVerified(true);
      updateValue(100);
    } catch {
      reset(pick('Verification failed, please try again', '验证失败，请重试'));
    } finally {
      setBusy(false);
    }
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    void completeDrag(drag);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (busy || verified || (event.key !== 'ArrowRight' && event.key !== 'End')) return;
    event.preventDefault();
    if (!dragRef.current) {
      const track = trackRef.current;
      const subject = currentUsername();
      if (!track || !subject) {
        setError(pick('Enter your username first', '请先输入用户名'));
        return;
      }
      if (subject !== username.trim()) onUsernameResolved?.(subject);
      const width = Math.round(track.getBoundingClientRect().width - THUMB_WIDTH);
      const started = performance.now();
      dragRef.current = {
        pointerId: -1,
        username: subject,
        started,
        offset: 0,
        width,
        distance: 0,
        tracks: [{ t: 0, x: 0 }],
        challenge: createChallenge(subject)
      };
    }
    const drag = dragRef.current;
    const distance =
      event.key === 'End'
        ? drag.width
        : Math.min(drag.width, drag.distance + Math.max(16, Math.round(drag.width / 10)));
    drag.distance = distance;
    if (drag.tracks.length < MAX_TRACKS) {
      drag.tracks.push({ t: Math.round(performance.now() - drag.started), x: distance });
    }
    updateValue((distance / drag.width) * 100);
    if (distance === drag.width) {
      dragRef.current = null;
      void completeDrag(drag);
    }
  }

  return (
    <div className='space-y-1'>
      <div
        ref={trackRef}
        role='slider'
        aria-label={pick('Slider captcha', '滑块验证')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-disabled={busy || verified}
        aria-busy={busy}
        tabIndex={verified ? -1 : 0}
        className={cn(
          'relative h-11 w-full touch-none select-none overflow-hidden rounded-md border bg-muted/50 outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          !busy && !verified && 'cursor-grab active:cursor-grabbing',
          verified && 'border-emerald-500/50 bg-emerald-500/10'
        )}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      >
        <div
          className={cn('absolute inset-y-0 left-0 bg-primary/15', verified && 'bg-emerald-500/20')}
          style={{ width: `calc(${value}% + ${THUMB_WIDTH / 2}px)` }}
        />
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center px-12 text-xs text-muted-foreground'>
          {verified
            ? pick('Verification complete', '验证完成')
            : busy
              ? pick('Verifying…', '验证中…')
              : pick('Drag the slider to verify', '拖动滑块完成验证')}
        </div>
        <div
          className={cn(
            'pointer-events-none absolute top-0 flex h-full w-11 items-center justify-center rounded-sm border bg-background shadow-sm',
            verified && 'text-emerald-600'
          )}
          style={{ left: `calc(${value}% - ${(value / 100) * THUMB_WIDTH}px)` }}
        >
          {verified ? <IconCheck className='size-5' /> : <IconChevronsRight className='size-5' />}
        </div>
      </div>
      {error && (
        <p role='alert' className='text-xs text-destructive'>
          {error}
        </p>
      )}
    </div>
  );
}

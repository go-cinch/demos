import { useEffect, useId, useRef, useState } from 'react';
import { request } from '../lib/api';
import { t } from '../locales';
import type { PointCaptcha as Challenge, CaptchaPoint } from '../lib/types';
import { Icon } from './UI';
import { message, resolveMessage, type Feedback } from '../lib/form-feedback';
export function ServerSlider({
  username,
  purpose,
  proof,
  onProof,
  resetKey,
}: {
  username: string;
  purpose: 'login' | 'register';
  proof: string;
  onProof: (v: string) => void;
  resetKey: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const keyboardHint = useId();
  const [position, setPosition] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Feedback>('');
  const drag = useRef({
    active: false,
    start: 0,
    time: 0,
    width: 0,
    pos: 0,
    generation: 0,
    tracks: [] as { x: number; t: number }[],
    challenge: null as Promise<{ captcha_id: string }> | null,
    inputMode: 'pointer' as 'pointer' | 'keyboard',
  });
  function reset() {
    drag.current.generation++;
    drag.current.active = false;
    setPosition(0);
    setBusy(false);
    setError('');
    onProof('');
  }
  useEffect(() => {
    reset();
    return () => {
      drag.current.generation++;
    };
  }, [username, purpose, resetKey]);
  function begin(inputMode: 'pointer' | 'keyboard') {
    if (busy || proof || !username.trim()) return false;
    reset();
    const d = drag.current;
    d.time = performance.now();
    d.width = Math.max(0, (track.current?.clientWidth || 0) - 52);
    d.pos = 0;
    d.tracks = [{ x: 0, t: 0 }];
    d.active = true;
    d.inputMode = inputMode;
    d.challenge = request('/auth/pub/slider/challenge', {
      method: 'POST',
      public: true,
      body: { purpose, username: username.trim() },
    });
    void d.challenge.catch(() => {});
    return true;
  }
  async function end() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.pos < d.width - 2 || !d.challenge || d.width <= 0) {
      reset();
      setError(message('app.captcha.sliderIncomplete'));
      return;
    }
    const generation = d.generation;
    setBusy(true);
    const duration = Math.round(performance.now() - d.time);
    const tracks = [...d.tracks, { x: Math.round(d.width), t: duration }];
    try {
      const challenge = await d.challenge;
      const result = await request<{ proof: string }>('/auth/pub/slider/verify', {
        method: 'POST',
        public: true,
        body: {
          captcha_id: challenge.captcha_id,
          distance: Math.round(d.width),
          width: Math.round(d.width),
          duration_ms: duration,
          tracks,
          purpose,
          username: username.trim(),
        },
      });
      if (generation === d.generation) onProof(result.proof);
    } catch {
      if (generation === d.generation) {
        setPosition(0);
        setError(message('app.captcha.sliderFailed'));
      }
    } finally {
      if (generation === d.generation) setBusy(false);
    }
  }
  return (
    <div>
      <div ref={track} className={`slider-track ${proof ? 'verified' : ''}`} aria-busy={busy}>
        <span>{t(busy ? 'app.captcha.checking' : proof ? 'app.captcha.passed' : 'slider')}</span>
        <button
          type="button"
          className="slider-handle"
          name="captcha-action"
          role="slider"
          aria-label={t('sliderHandle')}
          aria-describedby={keyboardHint}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={drag.current.width ? Math.round((position / drag.current.width) * 100) : 0}
          aria-valuetext={t('sliderProgress', {
            count: drag.current.width ? Math.round((position / drag.current.width) * 100) : 0,
          })}
          disabled={busy || !!proof || !username.trim()}
          style={{ transform: `translateX(${position}px)` }}
          onPointerDown={(e) => {
            if (!begin('pointer')) return;
            const d = drag.current;
            d.start = e.clientX;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d.active || d.inputMode !== 'pointer') return;
            d.pos = Math.min(d.width, Math.max(0, e.clientX - d.start));
            setPosition(d.pos);
            if (d.tracks.length < 127)
              d.tracks.push({ x: Math.round(d.pos), t: Math.round(performance.now() - d.time) });
          }}
          onPointerUp={() => void end()}
          onPointerCancel={reset}
          onKeyDown={(event) => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            if (busy || proof) return;
            if (event.key === 'Home') {
              reset();
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              if (drag.current.active && drag.current.inputMode === 'keyboard') void end();
              return;
            }
            if (!drag.current.active && (event.key !== 'ArrowRight' || !begin('keyboard'))) return;
            const d = drag.current;
            if (d.inputMode !== 'keyboard') return;
            d.pos = Math.min(
              d.width,
              Math.max(0, d.pos + (event.key === 'ArrowRight' ? 1 : -1) * Math.ceil(d.width / 20)),
            );
            setPosition(d.pos);
            if (d.tracks.length < 127)
              d.tracks.push({ x: Math.round(d.pos), t: Math.round(performance.now() - d.time) });
          }}
          onBlur={() => {
            if (drag.current.active && drag.current.inputMode === 'keyboard') reset();
          }}
        >
          <Icon name={proof ? 'check' : 'chevron-right-double'} />
        </button>
      </div>
      <p id={keyboardHint} className="slider-keyboard-hint">
        {t('sliderKeyboard')}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {resolveMessage(error)}
        </p>
      )}
    </div>
  );
}
export function PointCaptcha({
  captcha,
  onCaptcha,
  points,
  onPoints,
  username,
  authenticated = false,
}: {
  captcha: Challenge;
  onCaptcha: (v: Challenge) => void;
  points: CaptchaPoint[];
  onPoints: (p: CaptchaPoint[]) => void;
  username?: string;
  authenticated?: boolean;
}) {
  const [selected, setSelected] = useState<CaptchaPoint[]>([]),
    [cursor, setCursor] = useState<CaptchaPoint>({ x: captcha.width / 2, y: captcha.height / 2 }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Feedback>('');
  const image = useRef<HTMLImageElement>(null);
  const generation = useRef(0);
  const path = authenticated ? '/auth/captcha' : '/auth/pub/captcha';
  useEffect(() => {
    generation.current++;
    setSelected([]);
    setCursor({ x: captcha.width / 2, y: captcha.height / 2 });
    onPoints([]);
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [captcha.captcha_id]);
  async function refresh() {
    setBusy(true);
    setError('');
    onPoints([]);
    setSelected([]);
    try {
      onCaptcha(
        await request<Challenge>(path, {
          method: 'POST',
          public: !authenticated,
          body: { captcha_id: captcha.captcha_id },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(x: number, y: number) {
    if (busy || points.length) return;
    const at = selected.findIndex((q) => (q.x - x) ** 2 + (q.y - y) ** 2 <= 196);
    if (at >= 0) {
      setSelected(selected.filter((_, i) => i !== at));
      return;
    }
    const next = [...selected, { x, y }];
    setSelected(next);
    if (next.length < captcha.target_count) return;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      const result = await request<{ verified: boolean; captcha?: Challenge }>(`${path}/verify`, {
        method: 'POST',
        public: !authenticated,
        body: {
          captcha_id: captcha.captcha_id,
          captcha_points: next,
          ...(!authenticated ? { username } : {}),
        },
      });
      if (current !== generation.current) return;
      if (result.verified) onPoints(next);
      else {
        setSelected([]);
        if (result.captcha) onCaptcha(result.captcha);
        setError(message('app.captcha.failed'));
      }
    } catch (e) {
      if (current === generation.current) {
        setSelected([]);
        setError((e as Error).message);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <div className="point-captcha" aria-busy={busy}>
      <div className="section-heading">
        <span>{captcha.hint_text}</span>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          {t('refreshCaptcha')}
        </button>
      </div>
      <div
        className="captcha-image"
        role="button"
        tabIndex={0}
        aria-label={`${t('captchaAlt')}. ${t('pointCaptchaKeyboard')}`}
        onClick={(e) => {
          const box = image.current?.getBoundingClientRect();
          if (box)
            void select(
              Math.round(((e.clientX - box.left) / box.width) * captcha.width),
              Math.round(((e.clientY - box.top) / box.height) * captcha.height),
            );
        }}
        onKeyDown={(event) => {
          if (
            !['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'Enter', ' '].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          if (event.key === 'Enter' || event.key === ' ') {
            void select(Math.round(cursor.x), Math.round(cursor.y));
            return;
          }
          const stepX = Math.max(1, captcha.width / 20);
          const stepY = Math.max(1, captcha.height / 20);
          setCursor((point) =>
            event.key === 'Home'
              ? { x: captcha.width / 2, y: captcha.height / 2 }
              : {
                  x: Math.min(
                    captcha.width,
                    Math.max(
                      0,
                      point.x +
                        (event.key === 'ArrowRight'
                          ? stepX
                          : event.key === 'ArrowLeft'
                            ? -stepX
                            : 0),
                    ),
                  ),
                  y: Math.min(
                    captcha.height,
                    Math.max(
                      0,
                      point.y +
                        (event.key === 'ArrowDown' ? stepY : event.key === 'ArrowUp' ? -stepY : 0),
                    ),
                  ),
                },
          );
        }}
      >
        <img ref={image} src={captcha.captcha_image} alt={t('captchaAlt')} />
        <span
          className="captcha-keyboard-cursor"
          aria-hidden="true"
          style={{
            left: `${(cursor.x / captcha.width) * 100}%`,
            top: `${(cursor.y / captcha.height) * 100}%`,
          }}
        />
        {selected.map((p, i) => (
          <span
            key={i}
            className="captcha-point"
            style={{
              left: `${(p.x / captcha.width) * 100}%`,
              top: `${(p.y / captcha.height) * 100}%`,
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {resolveMessage(error)}
        </p>
      )}
      {points.length > 0 && <p className="success-text">{t('app.captcha.passed')}</p>}
    </div>
  );
}

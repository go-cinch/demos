import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Skeleton } from 'antd-mobile';
import {
  ApiError,
  acceptSession,
  loadUser,
  logout,
  request,
  session,
  submitCredentials,
} from '../lib/api';
import { rememberCredentials, rememberedCredentials } from '../lib/storage';
import { focusFirstError } from '../lib/form-focus';
import { nonempty } from '../lib/validation';
import { message, type Feedback } from '../lib/form-feedback';
import type { PointCaptcha as Challenge, CaptchaPoint } from '../lib/types';
import { t } from '../locales';
import { Copyright, Field, TextField, Toggle, ErrorBox, Icon } from '../components/UI';
import { ServerSlider, PointCaptcha } from '../components/Captcha';
export default function AuthPage() {
  const location = useLocation(),
    navigate = useNavigate();
  const mode = location.pathname.endsWith('register')
    ? 'register'
    : location.pathname.endsWith('reset-password')
      ? 'password_reset'
      : 'login';
  const saved = rememberedCredentials();
  const [username, setUsername] = useState(saved?.username || ''),
    [password, setPassword] = useState(mode === 'login' ? saved?.password || '' : ''),
    [confirmation, setConfirmation] = useState(''),
    [remember, setRemember] = useState(!!saved),
    [proof, setProof] = useState(''),
    [resetKey, setResetKey] = useState(0),
    [captcha, setCaptcha] = useState<Challenge>(),
    [points, setPoints] = useState<CaptchaPoint[]>([]),
    [verificationBusy, setVerificationBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, Feedback>>({}),
    [registeredNotice, setRegisteredNotice] = useState(
      Boolean((location.state as { registered?: boolean } | null)?.registered),
    );
  const verification = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!registeredNotice) return;
    navigate(location.pathname, { replace: true, state: null });
    const timer = window.setTimeout(() => setRegisteredNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);
  async function verifyUsername() {
    const current = ++verification.current;
    const value = username.trim();
    if (!value || mode === 'password_reset') return;
    setVerificationBusy(true);
    try {
      if (mode === 'register') {
        const result = await request<{ available: boolean }>(
          `/auth/pub/register/username?username=${encodeURIComponent(value)}`,
          { public: true },
        );
        if (current === verification.current)
          setErrors((e) => ({
            ...e,
            username: result.available ? '' : message('app.register.usernameExists'),
          }));
      } else {
        const result = await request<{ captcha?: Challenge }>(
          `/auth/pub/login/verification?username=${encodeURIComponent(value)}`,
          { public: true },
        );
        if (current === verification.current) setCaptcha(result.captcha);
      }
    } catch (e) {
      if (current === verification.current) setError((e as Error).message);
    } finally {
      if (current === verification.current) setVerificationBusy(false);
    }
  }
  async function submit() {
    if (busy) return;
    const e: Record<string, Feedback> = {};
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmation = confirmation.trim();
    setError('');
    if (mode !== 'password_reset' && !nonempty(trimmedUsername))
      e.username = message('app.validation.username');
    if (!nonempty(trimmedPassword)) e.password = message('app.validation.password');
    if (mode !== 'login' && trimmedPassword !== trimmedConfirmation)
      e.confirmation = message('page.profile.password.passwordMismatch');
    if (mode !== 'password_reset' && !captcha && !proof)
      e.proof = message('app.validation.verification');
    if (captcha && !points.length) e.captcha = message('app.validation.verification');
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        const available = await request<{ available: boolean }>(
          `/auth/pub/register/username?username=${encodeURIComponent(trimmedUsername)}`,
          { public: true },
        );
        if (!available.available) {
          setErrors({ username: message('app.register.usernameExists') });
          return;
        }
      }
      const payload =
        mode === 'password_reset'
          ? { new_password: trimmedPassword }
          : mode === 'register'
            ? { username: trimmedUsername, password: trimmedPassword, slider_proof: proof }
            : {
                username: trimmedUsername,
                password: trimmedPassword,
                remember_me: remember,
                slider_proof: captcha ? undefined : proof,
                captcha_id: captcha?.captcha_id,
                captcha_points: points.length ? points : undefined,
              };
      const result = await submitCredentials(mode, payload);
      if (mode === 'register') {
        rememberCredentials(trimmedUsername, trimmedPassword);
        navigate('/auth/login', { state: { registered: true } });
        return;
      }
      if (mode === 'password_reset') {
        const entry = rememberedCredentials();
        if (entry && (entry.username === username || entry.username === session.user?.username))
          rememberCredentials(entry.username, trimmedPassword);
      } else rememberCredentials(trimmedUsername, trimmedPassword, remember);
      acceptSession(result);
      if (result.password_reset_required) navigate('/auth/reset-password', { replace: true });
      else {
        await loadUser();
        const redirect = new URLSearchParams(location.search).get('redirect') || '';
        navigate(
          redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/auth/')
            ? redirect
            : '/dashboard/overview',
          { replace: true },
        );
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.data.captcha) {
        setCaptcha(e.data.captcha);
        setPoints([]);
      }
    } finally {
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  }
  return (
    <main id="main" className="auth-page">
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
        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode !== 'password_reset' && (
            <>
              <TextField
                name="username"
                label={t('system.fields.username')}
                value={username}
                onChange={(v) => {
                  verification.current++;
                  setVerificationBusy(false);
                  setUsername(v);
                  setCaptcha(undefined);
                  setPoints([]);
                  setErrors((e) => ({ ...e, username: '' }));
                }}
                error={errors.username}
                onBlur={() => void verifyUsername()}
                required
              />
              {verificationBusy && <Skeleton.Title animated className="field-check-skeleton" />}
            </>
          )}
          <TextField
            name="password"
            label={t(
              mode === 'password_reset' ? 'system.fields.newPassword' : 'system.fields.password',
            )}
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            error={errors.password}
            required
          />
          {mode !== 'login' && (
            <TextField
              name="confirmation"
              label={t('page.profile.password.confirmPassword')}
              value={confirmation}
              onChange={setConfirmation}
              type="password"
              error={errors.confirmation}
              required
            />
          )}
          {mode !== 'password_reset' && !captcha && (
            <Field name="verification" label={t('app.captcha.additional')} error={errors.proof}>
              <ServerSlider
                username={username}
                purpose={mode}
                proof={proof}
                onProof={setProof}
                resetKey={resetKey}
              />
            </Field>
          )}
          {captcha && (
            <Field
              name="point-verification"
              label={t('app.captcha.additional')}
              error={errors.captcha}
            >
              <PointCaptcha
                captcha={captcha}
                onCaptcha={setCaptcha}
                points={points}
                onPoints={setPoints}
                username={username}
              />
            </Field>
          )}
          {mode === 'login' && (
            <Toggle
              label={t('remember')}
              checked={remember}
              onChange={(v) => {
                setRemember(v);
                if (!v) rememberCredentials('', '', false);
              }}
            />
          )}
          <ErrorBox error={error} />
          {registeredNotice && (
            <p className="notice" role="status">
              {t('app.register.success')}
            </p>
          )}
          <Button block color="primary" type="submit" loading={busy}>
            {t(
              mode === 'login'
                ? 'page.auth.login'
                : mode === 'register'
                  ? 'page.auth.register'
                  : 'app.resetPassword.submit',
            )}
          </Button>
          {mode === 'password_reset' ? (
            <button type="button" className="auth-link" onClick={() => void logout()}>
              {t('logout')}
            </button>
          ) : (
            <Link className="auth-link" to={mode === 'login' ? '/auth/register' : '/auth/login'}>
              {t(mode === 'login' ? 'registerLink' : 'loginLink')}
            </Link>
          )}
        </form>
      </section>
      <Copyright />
    </main>
  );
}

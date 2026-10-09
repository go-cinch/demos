import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Skeleton } from 'antd-mobile';
import { ApiError, loadUser, logout, session, submitCredentials } from '../lib/api';
import { focusFirstError } from '../lib/form-focus';
import { nonempty } from '../lib/validation';
import { message, type Feedback } from '../lib/form-feedback';
import { initials } from '../lib/format';
import type { PointCaptcha as Challenge, CaptchaPoint } from '../lib/types';
import { t } from '../locales';
import { Sheet, Icon, TextField, Field, ErrorBox } from '../components/UI';
import { PointCaptcha } from '../components/Captcha';
export default function ProfilePage() {
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const [panel, setPanel] = useState(
      new URLSearchParams(location.search).get('tab') === 'password' ? 'password' : '',
    ),
    [old, setOld] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [errors, setErrors] = useState<Record<string, Feedback>>({}),
    [error, setError] = useState(''),
    [infoError, setInfoError] = useState(''),
    [infoLoading, setInfoLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [captcha, setCaptcha] = useState<Challenge>(),
    [points, setPoints] = useState<CaptchaPoint[]>([]);
  useEffect(() => {
    void loadUser()
      .catch((e) => setInfoError(e.message))
      .finally(() => setInfoLoading(false));
  }, []);
  function closePanel() {
    if (busy) return;
    setPanel('');
    setOld('');
    setPassword('');
    setConfirmation('');
    setErrors({});
    setError('');
    setCaptcha(undefined);
    setPoints([]);
  }
  async function submit() {
    if (busy) return;
    const e: Record<string, Feedback> = {};
    const trimmedOld = old.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmation = confirmation.trim();
    setError('');
    if (!nonempty(trimmedOld)) e.old = message('app.validation.currentPassword');
    if (!nonempty(trimmedPassword)) e.password = message('app.validation.password');
    if (trimmedPassword !== trimmedConfirmation)
      e.confirmation = message('page.profile.password.passwordMismatch');
    if (captcha && !points.length) e.captcha = message('app.validation.verification');
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    try {
      await submitCredentials('password_change', {
        old_password: trimmedOld,
        new_password: trimmedPassword,
        captcha_id: captcha?.captcha_id,
        captcha_points: points.length ? points : undefined,
      });
      await logout();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.data.captcha) {
        setCaptcha(e.data.captcha);
        setPoints([]);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t('workspace')}</p>
          <h1>{t('mine')}</h1>
          <p className="lead">{t('profileHint')}</p>
        </div>
      </header>
      <ErrorBox error={infoError} />
      <section className="profile-card metal-card" aria-busy={infoLoading}>
        {infoLoading && !session.user ? (
          <div className="profile-skeleton">
            <Skeleton.Title animated />
            <Skeleton.Title animated />
          </div>
        ) : (
          <>
            <span className="avatar large">{initials(session.user?.username || '')}</span>
            <div>
              <h2>{session.user?.username}</h2>
              <p>{session.user?.role?.name || '—'}</p>
              <small>{session.user?.code}</small>
            </div>
          </>
        )}
      </section>
      <h2 className="section-title">{t('page.auth.profile')}</h2>
      <section className="card">
        {['profile', 'password'].map((key) => (
          <button className="menu-row" key={key} onClick={() => setPanel(key)}>
            <Icon name={key === 'profile' ? 'user' : 'lock-on'} />
            <span>{t(key)}</span>
            <Icon name="chevron-right" size={18} />
          </button>
        ))}
      </section>
      <div className="about">
        <span>Cinch · {t('moon')}</span>
        <small>Ant Design Mobile</small>
      </div>
      <Button block color="danger" fill="outline" onClick={() => setPanel('logout')}>
        {t('logout')}
      </Button>
      <Sheet
        open={!!panel}
        onClose={closePanel}
        busy={busy}
        footer={
          panel === 'password' ? (
            <Button block color="primary" type="submit" form="profile-password-form" loading={busy}>
              {t('save')}
            </Button>
          ) : undefined
        }
        title={t(panel === 'logout' ? 'logoutConfirm' : panel)}
      >
        {panel === 'profile' ? (
          <dl className="details">
            <div>
              <dt>{t('system.fields.username')}</dt>
              <dd>{session.user?.username}</dd>
            </div>
            <div>
              <dt>{t('system.fields.role')}</dt>
              <dd>{session.user?.role?.name || '—'}</dd>
            </div>
            <div>
              <dt>{t('system.fields.userCode')}</dt>
              <dd>{session.user?.code}</dd>
            </div>
          </dl>
        ) : panel === 'logout' ? (
          <div className="sheet-actions">
            <Button onClick={() => setPanel('')}>{t('cancel')}</Button>
            <Button color="danger" onClick={() => void logout()}>
              {t('logout')}
            </Button>
          </div>
        ) : panel === 'password' ? (
          <form
            id="profile-password-form"
            ref={formRef}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextField
              name="old-password"
              label={t('page.profile.password.oldPassword')}
              value={old}
              onChange={setOld}
              type="password"
              autoComplete="current-password"
              error={errors.old}
              required
            />
            <TextField
              name="new-password"
              label={t('page.profile.password.newPassword')}
              value={password}
              onChange={setPassword}
              type="password"
              error={errors.password}
              required
            />
            <TextField
              name="confirm-password"
              label={t('page.profile.password.confirmPassword')}
              value={confirmation}
              onChange={setConfirmation}
              type="password"
              error={errors.confirmation}
              required
            />
            {captcha && (
              <Field
                name="password-captcha"
                label={t('app.captcha.additional')}
                error={errors.captcha}
              >
                <PointCaptcha
                  captcha={captcha}
                  onCaptcha={setCaptcha}
                  points={points}
                  onPoints={setPoints}
                  authenticated
                />
              </Field>
            )}
            <ErrorBox error={error} />
          </form>
        ) : null}
      </Sheet>
    </div>
  );
}

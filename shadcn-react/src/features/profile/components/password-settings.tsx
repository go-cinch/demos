'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changePassword,
  logout,
  request,
  type CaptchaPoint,
  type PointCaptcha
} from '@/features/auth/api';
import { PointCaptchaView } from '@/features/auth/components/point-captcha';
import { useLocale } from '@/features/i18n/locale-context';
import * as React from 'react';
import { toast } from 'sonner';
import { isValidPassword } from '@/features/auth/validation';

export default function PasswordSettings() {
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const { pick } = useLocale();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [captcha, setCaptcha] = React.useState<PointCaptcha>();
  const [points, setPoints] = React.useState<CaptchaPoint[]>([]);
  const [verified, setVerified] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const updatePoints = React.useCallback(
    async (next: CaptchaPoint[]) => {
      setPoints(next);
      setVerified(false);
      if (!captcha || next.length !== captcha.target_count) return;
      try {
        const result = await request<{ verified: boolean; captcha?: PointCaptcha }>(
          '/captcha/verify',
          {
            method: 'POST',
            body: JSON.stringify({ captcha_id: captcha.captcha_id, captcha_points: next })
          }
        );
        setVerified(result.verified);
        if (!result.verified && result.captcha) setCaptcha(result.captcha);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : pick('Verification failed', '验证失败')
        );
      }
    },
    [captcha, pick]
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!oldPassword.trim())
      nextErrors.old = pick('Current password is required', '请输入当前密码');
    if (!newPassword.trim()) nextErrors.new = pick('New password is required', '请输入新密码');
    if (!confirm.trim())
      nextErrors.confirm = pick('Please confirm the new password', '请确认新密码');
    if (newPassword && !isValidPassword(newPassword))
      nextErrors.new = pick('Password is required', '请输入密码');
    if (confirm && newPassword.trim() !== confirm.trim())
      nextErrors.confirm = pick('Passwords do not match', '两次输入的密码不一致');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
      return;
    }
    if (captcha && !verified) {
      toast.error(pick('Complete point verification', '请完成点选验证'));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await changePassword(
        oldPassword.trim(),
        newPassword.trim(),
        captcha ? { id: captcha.captcha_id, points } : undefined
      );
      toast.success(pick('Password changed. Please sign in again.', '密码修改成功，请重新登录。'));
      await logout();
      window.location.href = '/auth/login';
    } catch (error) {
      const data = (
        error as Error & { data?: { captcha_required?: boolean; captcha?: PointCaptcha } }
      ).data;
      if (data?.captcha_required && data.captcha) {
        setCaptcha(data.captcha);
        setPoints([]);
        setVerified(false);
      }
      toast.error(
        error instanceof Error ? error.message : pick('Password change failed', '密码修改失败')
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form noValidate onSubmit={submit} className='space-y-4'>
      {[
        {
          id: 'old',
          label: pick('Current password', '当前密码'),
          value: oldPassword,
          set: setOldPassword
        },
        {
          id: 'new',
          label: pick('New password', '新密码'),
          value: newPassword,
          set: setNewPassword
        },
        {
          id: 'confirm',
          label: pick('Confirm password', '确认密码'),
          value: confirm,
          set: setConfirm
        }
      ].map((field) => (
        <div className='space-y-2' key={field.id}>
          <Label htmlFor={field.id}>
            {field.label}
            <span className='ml-1 text-destructive'>*</span>
          </Label>
          <Input
            id={field.id}
            type='password'
            value={field.value}
            aria-invalid={Boolean(errors[field.id])}
            aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
            onChange={(event) => {
              field.set(event.target.value);
              setErrors((old) => {
                const next = { ...old };
                delete next[field.id];
                return next;
              });
            }}
          />
          {errors[field.id] && (
            <p id={`${field.id}-error`} role='alert' className='text-xs text-destructive'>
              {errors[field.id]}
            </p>
          )}
        </div>
      ))}
      {captcha && (
        <PointCaptchaView
          key={captcha.captcha_id}
          captcha={captcha}
          onChange={(value) => void updatePoints(value)}
          onRefresh={() =>
            void request<PointCaptcha>('/captcha', {
              method: 'POST',
              body: JSON.stringify({ captcha_id: captcha.captcha_id })
            }).then(setCaptcha)
          }
        />
      )}
      <Button type='submit' disabled={busy}>
        {busy ? pick('Saving…', '保存中…') : pick('Change password', '修改密码')}
      </Button>
    </form>
  );
}

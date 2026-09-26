'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetRequiredPassword } from '@/features/auth/api';
import { resolveHomePath, useAuth } from '@/features/auth/auth-context';
import { AuthShell } from '@/features/auth/components/sign-in-view';
import { useLocale } from '@/features/i18n/locale-context';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { isValidPassword } from '@/features/auth/validation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const auth = useAuth();
  const { pick } = useLocale();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!isValidPassword(password))
      nextErrors.password = pick('Password is required', '请输入密码');
    if (!confirm || password !== confirm)
      nextErrors.confirm = pick('Passwords do not match', '两次输入的密码不一致');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await resetRequiredPassword(password);
      auth.setPasswordResetRequired(false);
      const user = await auth.reload();
      router.push(resolveHomePath(user));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Reset failed', '重置失败'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={pick('Set a new password', '设置新密码')}
      description={pick(
        'Your account requires a password change before continuing',
        '继续使用前必须修改密码'
      )}
    >
      <form className='space-y-4' noValidate onSubmit={submit}>
        {[
          {
            id: 'password',
            label: pick('New password', '新密码'),
            value: password,
            set: setPassword
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
                setErrors((old) => ({ ...old, [field.id]: '' }));
              }}
            />
            {errors[field.id] && (
              <p id={`${field.id}-error`} role='alert' className='text-xs text-destructive'>
                {errors[field.id]}
              </p>
            )}
          </div>
        ))}
        <Button type='submit' className='w-full' disabled={busy}>
          {busy ? pick('Saving…', '保存中…') : pick('Continue', '继续')}
        </Button>
        <Button
          type='button'
          variant='outline'
          className='w-full'
          disabled={busy}
          onClick={() => void auth.signOut(false)}
        >
          {pick('Sign out and return to login', '退出并返回登录')}
        </Button>
      </form>
    </AuthShell>
  );
}

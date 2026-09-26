'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { register, request } from '@/features/auth/api';
import { useLocale } from '@/features/i18n/locale-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { AuthShell } from './sign-in-view';
import { SliderCaptcha } from './slider-captcha';
import { isValidPassword, isValidUsername } from '../validation';

export default function SignUpViewPage() {
  const router = useRouter();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const { pick } = useLocale();
  const [proof, setProof] = React.useState('');
  const [available, setAvailable] = React.useState<boolean>();
  const [busy, setBusy] = React.useState(false);
  const [sliderAttempt, setSliderAttempt] = React.useState(0);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!isValidUsername(username.trim())) return;
    let active = true;
    const timer = setTimeout(
      () =>
        request<{ available: boolean }>(
          `/auth/pub/register/username?username=${encodeURIComponent(username.trim())}`,
          {},
          false
        )
          .then((value) => {
            if (active) setAvailable(value.available);
          })
          .catch(() => {
            if (active) setAvailable(undefined);
          }),
      350
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!isValidUsername(username.trim()))
      nextErrors.username = pick('Username is required', '请输入用户名');
    if (!isValidPassword(password))
      nextErrors.password = pick('Password is required', '请输入密码');
    if (password !== confirm || !confirm)
      nextErrors.confirm = pick('Passwords do not match', '两次输入的密码不一致');
    if (!proof)
      nextErrors.verification = pick('Please complete slider verification', '请完成滑块验证');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const availability = await request<{ available: boolean }>(
        `/auth/pub/register/username?username=${encodeURIComponent(username.trim())}`,
        {},
        false
      );
      if (!availability.available) {
        setAvailable(false);
        toast.error(pick('Username is already used', '用户名已被使用'));
        return;
      }
      await register({ username: username.trim(), password, slider_proof: proof });
      toast.success(pick('Registration submitted', '注册申请已提交'));
      router.push('/auth/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : pick('Registration failed', '注册失败'));
      setProof('');
      setSliderAttempt((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title={pick('Create account', '创建账号')}
      description={pick('Register a Go Cinch account', '注册 Go Cinch 账号')}
    >
      <form noValidate onSubmit={submit} className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='username'>
            {pick('Username', '用户名')}
            <span className='ml-1 text-destructive'>*</span>
          </Label>
          <Input
            id='username'
            name='username'
            value={username}
            aria-invalid={Boolean(errors.username)}
            onChange={(e) => {
              setUsername(e.target.value);
              setErrors((old) => ({ ...old, username: '' }));
              setProof('');
              setAvailable(undefined);
              setSliderAttempt((value) => value + 1);
            }}
          />
          {errors.username && (
            <p role='alert' className='text-xs text-destructive'>
              {errors.username}
            </p>
          )}
          {available !== undefined && (
            <p className={`text-xs ${available ? 'text-emerald-600' : 'text-destructive'}`}>
              {available
                ? pick('Username is available', '用户名可用')
                : pick('Username is already used', '用户名已被使用')}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <Label htmlFor='password'>
            {pick('Password', '密码')}
            <span className='ml-1 text-destructive'>*</span>
          </Label>
          <Input
            id='password'
            name='password'
            type='password'
            value={password}
            aria-invalid={Boolean(errors.password)}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((old) => ({ ...old, password: '' }));
            }}
          />
          {errors.password && (
            <p role='alert' className='text-xs text-destructive'>
              {errors.password}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <Label htmlFor='confirm'>
            {pick('Confirm password', '确认密码')}
            <span className='ml-1 text-destructive'>*</span>
          </Label>
          <Input
            id='confirm'
            type='password'
            value={confirm}
            aria-invalid={Boolean(errors.confirm)}
            onChange={(e) => {
              setConfirm(e.target.value);
              setErrors((old) => ({ ...old, confirm: '' }));
            }}
          />
          {errors.confirm && (
            <p role='alert' className='text-xs text-destructive'>
              {errors.confirm}
            </p>
          )}
        </div>
        <SliderCaptcha
          key={sliderAttempt}
          purpose='register'
          username={username}
          onUsernameResolved={setUsername}
          onVerified={(value) => {
            setProof(value);
            setErrors((old) => ({ ...old, verification: '' }));
          }}
        />
        {errors.verification && (
          <p role='alert' className='text-xs text-destructive'>
            {errors.verification}
          </p>
        )}
        <Button type='submit' className='w-full' disabled={busy || available === false}>
          {busy ? pick('Creating…', '创建中…') : pick('Create account', '创建账号')}
        </Button>
        <p className='text-center text-sm text-muted-foreground'>
          {pick('Already registered?', '已有账号？')}{' '}
          <Link className='text-primary underline' href='/auth/login'>
            {pick('Sign in', '登录')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

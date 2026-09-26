'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppFooter } from '@/components/layout/app-footer';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { ThemeSelector } from '@/components/themes/theme-selector';
import {
  login,
  rememberedAccount,
  request,
  type CaptchaPoint,
  type PointCaptcha
} from '@/features/auth/api';
import { resolveHomePath, useAuth } from '@/features/auth/auth-context';
import { isValidPassword, isValidUsername } from '@/features/auth/validation';
import { useLocale } from '@/features/i18n/locale-context';
import { IconLayoutSidebarLeftExpand, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { PointCaptchaView } from './point-captcha';
import { SliderCaptcha } from './slider-captcha';

export default function SignInViewPage() {
  const router = useRouter();
  const auth = useAuth();
  const { pick } = useLocale();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(false);
  const [sliderProof, setSliderProof] = React.useState('');
  const [sliderAttempt, setSliderAttempt] = React.useState(0);
  const [captcha, setCaptcha] = React.useState<PointCaptcha>();
  const [points, setPoints] = React.useState<CaptchaPoint[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [captchaVerified, setCaptchaVerified] = React.useState(false);
  const [captchaVerifying, setCaptchaVerifying] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const saved = rememberedAccount();
    if (saved) {
      // oxlint-disable-next-line react/set-state-in-effect -- hydrate browser-only remembered account after mount
      setUsername(saved.username);
      setPassword(saved.password);
      setRemember(true);
    }
  }, []);
  React.useEffect(() => {
    if (!auth.loading && auth.user && !auth.passwordResetRequired)
      router.replace(resolveHomePath(auth.user));
  }, [auth.loading, auth.passwordResetRequired, auth.user, router]);
  React.useEffect(() => {
    if (!username.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      request<{ captcha_required: boolean; captcha?: PointCaptcha }>(
        `/auth/pub/login/verification?username=${encodeURIComponent(username.trim())}`,
        {},
        false
      )
        .then((result) => {
          if (active) setCaptcha(result.captcha_required ? result.captcha : undefined);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username]);
  const updateCaptchaPoints = React.useCallback(
    async (next: CaptchaPoint[]) => {
      setPoints(next);
      setCaptchaVerified(false);
      if (!captcha || next.length !== captcha.target_count) return;
      setCaptchaVerifying(true);
      try {
        const result = await request<{ verified: boolean; captcha?: PointCaptcha }>(
          '/auth/pub/captcha/verify',
          {
            method: 'POST',
            body: JSON.stringify({
              username: username.trim(),
              captcha_id: captcha.captcha_id,
              captcha_points: next
            })
          },
          false
        );
        if (!result.verified && result.captcha) {
          setCaptcha(result.captcha);
          setPoints([]);
          toast.error(pick('Verification failed, please try again', '验证失败，请重试'));
        } else if (result.verified) {
          setCaptchaVerified(true);
          toast.success(pick('Point verification complete', '点选验证完成'));
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : pick('Verification failed', '验证失败')
        );
      } finally {
        setCaptchaVerifying(false);
      }
    },
    [captcha, pick, username]
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!isValidUsername(username.trim()))
      nextErrors.username = pick('Username is required', '请输入用户名');
    if (!isValidPassword(password))
      nextErrors.password = pick('Password is required', '请输入密码');
    if (!captcha && !sliderProof)
      nextErrors.verification = pick('Please complete slider verification', '请完成滑块验证');
    if (captcha && !captchaVerified)
      nextErrors.verification = pick('Please complete point verification', '请完成点选验证');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await login({
        username: username.trim(),
        password,
        remember_me: remember,
        slider_proof: sliderProof,
        captcha_id: captcha?.captcha_id,
        captcha_points: points
      });
      auth.setPasswordResetRequired(result.password_reset_required);
      if (result.password_reset_required) router.push('/auth/reset-password');
      else {
        const user = await auth.reload();
        const redirect = new URLSearchParams(window.location.search).get('redirect');
        router.push(
          redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : resolveHomePath(user)
        );
      }
    } catch (error) {
      const data = (
        error as Error & { data?: { captcha_required?: boolean; captcha?: PointCaptcha } }
      ).data;
      if (data?.captcha_required && data.captcha) {
        setCaptcha(data.captcha);
        setCaptchaVerified(false);
        setPoints([]);
      }
      toast.error(error instanceof Error ? error.message : pick('Login failed', '登录失败'));
      setSliderProof('');
      setSliderAttempt((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title={pick('Welcome back', '欢迎回来')}
      description={pick('Sign in to Go Cinch Admin', '登录 Go Cinch 管理后台')}
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
            aria-describedby={errors.username ? 'username-error' : undefined}
            onChange={(e) => {
              setUsername(e.target.value);
              setErrors((old) => ({ ...old, username: '' }));
              setSliderProof('');
              setSliderAttempt((value) => value + 1);
              setCaptcha(undefined);
              setPoints([]);
              setCaptchaVerified(false);
            }}
            autoComplete='username'
          />
          {errors.username && (
            <p id='username-error' role='alert' className='text-xs text-destructive'>
              {errors.username}
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
            aria-describedby={errors.password ? 'password-error' : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((old) => ({ ...old, password: '' }));
            }}
            autoComplete='current-password'
          />
          {errors.password && (
            <p id='password-error' role='alert' className='text-xs text-destructive'>
              {errors.password}
            </p>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='remember'
            checked={remember}
            onCheckedChange={(value) => setRemember(value === true)}
          />
          <Label htmlFor='remember'>{pick('Remember account', '记住账号')}</Label>
        </div>
        <SliderCaptcha
          key={sliderAttempt}
          purpose='login'
          username={username}
          onUsernameResolved={setUsername}
          onVerified={(proof) => {
            setSliderProof(proof);
            setErrors((old) => ({ ...old, verification: '' }));
          }}
        />
        {captcha && (
          <PointCaptchaView
            key={captcha.captcha_id}
            captcha={captcha}
            onChange={(value) => void updateCaptchaPoints(value)}
            onRefresh={() =>
              void request<PointCaptcha>(
                '/auth/pub/captcha',
                { method: 'POST', body: JSON.stringify({ captcha_id: captcha.captcha_id }) },
                false
              ).then((next) => {
                setCaptcha(next);
                setCaptchaVerified(false);
                setPoints([]);
              })
            }
          />
        )}
        {errors.verification && (
          <p id='verification-error' role='alert' className='text-xs text-destructive'>
            {errors.verification}
          </p>
        )}
        <Button className='w-full' disabled={busy || captchaVerifying} type='submit'>
          {busy
            ? pick('Signing in…', '登录中…')
            : captchaVerifying
              ? pick('Verifying…', '验证中…')
              : pick('Sign in', '登录')}
        </Button>
        <p className='text-center text-sm text-muted-foreground'>
          {pick('No account?', '还没有账号？')}{' '}
          <Link className='text-primary underline' href='/auth/register'>
            {pick('Create one', '立即注册')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { locale, setLocale, pick } = useLocale();
  const [panelSide, setPanelSide] = React.useState<'left' | 'right'>('right');

  React.useEffect(() => {
    const saved = localStorage.getItem('go-cinch-auth-panel-side');
    // oxlint-disable-next-line react/set-state-in-effect -- hydrate browser-only panel preference after mount
    if (saved === 'left' || saved === 'right') setPanelSide(saved);
  }, []);

  function togglePanelSide() {
    const next = panelSide === 'left' ? 'right' : 'left';
    localStorage.setItem('go-cinch-auth-panel-side', next);
    setPanelSide(next);
  }

  return (
    <main
      className={`relative flex min-h-screen flex-col overflow-hidden bg-muted/40 px-4 pt-20 ${panelSide === 'left' ? 'items-start' : 'items-end'}`}
    >
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--primary)_0,transparent_42%)] opacity-10' />
      <div className='absolute top-4 right-4 z-20 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border bg-background/85 p-1.5 shadow-sm backdrop-blur'>
        <ThemeSelector />
        <Button
          type='button'
          variant='outline'
          size='icon'
          title={pick('Switch login panel position', '切换登录面板位置')}
          aria-label={pick('Switch login panel position', '切换登录面板位置')}
          onClick={togglePanelSide}
        >
          {panelSide === 'left' ? (
            <IconLayoutSidebarRightExpand />
          ) : (
            <IconLayoutSidebarLeftExpand />
          )}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
          aria-label={pick('Switch language', '切换语言')}
        >
          {locale === 'zh-CN' ? 'EN' : '中文'}
        </Button>
        <ThemeModeToggle />
      </div>
      <section className='relative z-10 flex w-full flex-1 items-center justify-center lg:w-1/2'>
        <div className='w-full max-w-md py-8'>
          <div className='mb-5 flex min-w-0 items-center justify-center gap-3 px-2'>
            <Image
              src='/go-cinch.svg'
              width={48}
              height={48}
              alt='Go Cinch'
              className='size-12 shrink-0 dark:hidden'
              priority
            />
            <Image
              src='/go-cinch-white.svg'
              width={48}
              height={48}
              alt='Go Cinch'
              className='hidden size-12 shrink-0 dark:block'
              priority
            />
            <div className='min-w-0 leading-tight font-semibold tracking-tight'>
              <span className='text-base sm:hidden'>Go Cinch</span>
              <span className='hidden text-lg sm:inline xl:hidden'>Go Cinch Admin</span>
              <span className='hidden text-2xl xl:inline'>Go Cinch Admin by shadcn/ui</span>
            </div>
          </div>
          <Card className='w-full'>
            <CardHeader>
              <CardTitle className='text-2xl'>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          <AppFooter />
        </div>
      </section>
    </main>
  );
}

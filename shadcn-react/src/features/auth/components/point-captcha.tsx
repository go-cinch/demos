'use client';

import { Button } from '@/components/ui/button';
import type { CaptchaPoint, PointCaptcha } from '@/features/auth/api';
import { useLocale } from '@/features/i18n/locale-context';
import * as React from 'react';

export function PointCaptchaView({
  captcha,
  onChange,
  onRefresh
}: {
  captcha: PointCaptcha;
  onChange: (points: CaptchaPoint[]) => void;
  onRefresh: () => void;
}) {
  const { pick } = useLocale();
  const [points, setPoints] = React.useState<CaptchaPoint[]>([]);
  return (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-center justify-between text-xs'>
        <span>{captcha.hint_text}</span>
        <Button type='button' size='sm' variant='ghost' onClick={onRefresh}>
          {pick('Refresh', '刷新')}
        </Button>
      </div>
      <button
        type='button'
        aria-label={pick('Select captcha points', '选择验证码图中的目标点')}
        className='relative mx-auto block max-w-full cursor-crosshair overflow-hidden rounded'
        style={{ aspectRatio: `${captcha.width}/${captcha.height}` }}
        onClick={(event) => {
          if (points.length >= captcha.target_count) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const next = [
            ...points,
            {
              x: Math.round(((event.clientX - rect.left) * captcha.width) / rect.width),
              y: Math.round(((event.clientY - rect.top) * captcha.height) / rect.height)
            }
          ];
          setPoints(next);
          onChange(next);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={captcha.captcha_image}
          alt={pick('Point selection captcha', '点选验证码')}
          className='h-full w-full object-contain'
        />
        {points.map((point, index) => (
          <span
            key={`${point.x}-${point.y}`}
            className='absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground'
            style={{
              left: `${(point.x / captcha.width) * 100}%`,
              top: `${(point.y / captcha.height) * 100}%`
            }}
          >
            {index + 1}
          </span>
        ))}
      </button>
    </div>
  );
}

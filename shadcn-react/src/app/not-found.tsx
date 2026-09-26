'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/i18n/locale-context';

export default function NotFound() {
  const router = useRouter();
  const { pick } = useLocale();

  return (
    <div className='absolute top-1/2 left-1/2 mb-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center'>
      <span className='from-foreground bg-linear-to-b to-transparent bg-clip-text text-[10rem] leading-none font-extrabold text-transparent'>
        404
      </span>
      <h2 className='font-heading my-2 text-2xl font-bold'>
        {pick('Page not found', '页面不存在')}
      </h2>
      <p>{pick('The page does not exist or has been moved.', '你访问的页面不存在或已被移动。')}</p>
      <div className='mt-8 flex justify-center gap-2'>
        <Button onClick={() => router.back()} variant='default' size='lg'>
          {pick('Go back', '返回上一页')}
        </Button>
        <Button onClick={() => router.push('/dashboard/overview')} variant='ghost' size='lg'>
          {pick('Back to home', '返回首页')}
        </Button>
      </div>
    </div>
  );
}

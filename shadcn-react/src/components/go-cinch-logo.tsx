import Image from 'next/image';
import { cn } from '@/lib/utils';

interface GoCinchLogoProps {
  className?: string;
  size?: number;
  priority?: boolean;
}

export function GoCinchLogo({ className, size = 32, priority = false }: GoCinchLogoProps) {
  return (
    <>
      <Image
        src='/go-cinch.svg'
        width={size}
        height={size}
        alt='Go Cinch'
        className={cn('shrink-0 dark:hidden', className)}
        priority={priority}
      />
      <Image
        src='/go-cinch-white.svg'
        width={size}
        height={size}
        alt='Go Cinch'
        className={cn('hidden shrink-0 dark:block', className)}
        priority={priority}
      />
    </>
  );
}

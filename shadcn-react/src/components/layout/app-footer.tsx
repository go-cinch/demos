'use client';

import { useCopyright } from '@/features/preferences/copyright-context';

export function AppFooter({ className = '' }: { className?: string }) {
  const { preferences } = useCopyright();
  if (!preferences.enabled) return null;
  return (
    <footer className={`py-4 text-center text-xs text-muted-foreground ${className}`}>
      Copyright © {preferences.date}{' '}
      <a
        className='underline-offset-4 hover:text-foreground hover:underline'
        href={preferences.companyLink}
        rel='noreferrer'
        target='_blank'
      >
        {preferences.company}
      </a>
      {preferences.icp && (
        <>
          {' '}
          ·{' '}
          <a
            className='underline-offset-4 hover:text-foreground hover:underline'
            href={preferences.icpLink || undefined}
            rel='noreferrer'
            target={preferences.icpLink ? '_blank' : undefined}
          >
            {preferences.icp}
          </a>
        </>
      )}
    </footer>
  );
}

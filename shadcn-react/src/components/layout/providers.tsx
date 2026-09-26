'use client';
import { AuthProvider } from '@/features/auth/auth-context';
import { LocaleProvider } from '@/features/i18n/locale-context';
import React from 'react';
import { ActiveThemeProvider } from '../themes/active-theme';
import QueryProvider from './query-provider';
import { CopyrightProvider } from '@/features/preferences/copyright-context';

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ActiveThemeProvider initialTheme={activeThemeValue}>
        <LocaleProvider>
          <CopyrightProvider>
            <AuthProvider>
              <QueryProvider>{children}</QueryProvider>
            </AuthProvider>
          </CopyrightProvider>
        </LocaleProvider>
      </ActiveThemeProvider>
    </>
  );
}

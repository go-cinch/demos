'use client';

import { ThemeProvider as NextThemesProvider, ThemeProviderProps, useTheme } from 'next-themes';
import { useEffect } from 'react';

function ThemeFavicon() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    // Keep the dynamic icon separate from Next.js's streamed metadata.
    const icon = document.createElement('link');
    icon.id = 'go-cinch-theme-favicon';
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.sizes.add('any');
    icon.href = resolvedTheme === 'dark' ? '/go-cinch-white.svg' : '/go-cinch.svg';
    document.head.append(icon);
    return () => icon.remove();
  }, [resolvedTheme]);

  return null;
}

export default function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemeFavicon />
      {children}
    </NextThemesProvider>
  );
}

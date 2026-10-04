'use client';
import en from './locales/en-US.json';
import zh from './locales/zh-CN.json';
import { useLocale } from '@/features/i18n/locale-context';
export function useMsgLocale() {
  const { locale } = useLocale();
  return (key: string, params: Record<string, string | number> = {}) => {
    let value = String((locale === 'zh-CN' ? zh : en)[key as keyof typeof en] ?? key);
    for (const [name, replacement] of Object.entries(params))
      value = value.replace(`{${name}}`, String(replacement));
    return value;
  };
}

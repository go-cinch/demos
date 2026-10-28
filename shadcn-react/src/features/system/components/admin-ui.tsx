'use client';
import { useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/i18n/locale-context';
import english from '@/features/admin/en.json';
import chinese from '@/features/admin/zh.json';
import { hasAuditExport } from '@/features/audit/access';
import { effectiveTimezone } from '@/features/admin/model';
export const panelClass = 'rounded-lg border bg-card p-5 text-card-foreground';
export const mutedClass = 'text-sm text-muted-foreground';
export function AButton({
  children,
  testId,
  ariaLabel,
  danger = false,
  onClick,
  active = false,
  disabled = false
}: {
  children: ReactNode;
  testId?: string;
  ariaLabel?: string;
  danger?: boolean;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      data-testid={testId}
      aria-label={ariaLabel}
      type='button'
      size='sm'
      variant={danger ? 'destructive' : active ? 'default' : 'outline'}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
export function useAdminText() {
  const { locale } = useLocale();
  return useCallback(
    (key: string, params: Record<string, string | number> = {}) => {
      let value: unknown = locale === 'zh-CN' ? chinese : english;
      for (const part of key.split('.'))
        value =
          value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
      let result = typeof value === 'string' ? value : key;
      for (const [name, replacement] of Object.entries(params))
        result = result.replaceAll(`{${name}}`, String(replacement));
      return result;
    },
    [locale]
  );
}
export function useAdminTimezone() {
  return effectiveTimezone(useLocale().timezone);
}

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
export function AdminDrawer({
  open,
  title,
  onClose,
  children,
  footer,
  bare = false,
  wide = false
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bare?: boolean;
  wide?: boolean;
}) {
  const text = useAdminText();
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        className={wide
          ? 'gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl'
          : 'gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl'}
        data-testid='management-drawer'
      >
        {bare ? (
          <SheetTitle className='sr-only'>{title}</SheetTitle>
        ) : (
          <SheetHeader className='flex-row items-center justify-between border-b p-5'>
            <SheetTitle>{title}</SheetTitle>
            <AButton onClick={onClose}>{text('system-cards.close')}</AButton>
          </SheetHeader>
        )}
        <div
          className={bare ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto p-5'}
          data-testid='management-drawer-body'
        >
          {children}
        </div>
        {footer && (
          <footer className='flex shrink-0 justify-end gap-2 border-t p-5'>{footer}</footer>
        )}
      </SheetContent>
    </Sheet>
  );
}

import { StyledSelect } from './record-selects';
import { useAuth } from '@/features/auth/auth-context';
import PageContainer from '@/components/layout/page-container';
import { useSearchParams } from 'next/navigation';
export function ASelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <StyledSelect
      ariaLabel={label}
      value={value}
      onChange={onChange}
      options={options}
      className='min-w-32'
    />
  );
}
export function useAuditAccess(kind: 'login' | 'operation') {
  const { user } = useAuth();
  const params = useSearchParams();
  const menus = user?.permission.menus ?? [];
  return {
    identity: user?.id,
    username: params.get('username') ?? '',
    read: menus.includes(`/audit/${kind}`),
    export: hasAuditExport(user, kind),
    menu: menus.includes('*') || menus.includes(`/audit/${kind}`)
  };
}
export function AuditPageFrame({
  title,
  allowed,
  children
}: {
  title: string;
  allowed: boolean;
  children: ReactNode;
}) {
  return (
    <PageContainer pageTitle={title} access={allowed}>
      {children}
    </PageContainer>
  );
}

export function useAdminIdentity() {
  return useAuth().user;
}

import { Checkbox } from '@/components/ui/checkbox';
export function ACheck({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(value) => onChange(value === true)}
    />
  );
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
export function AdminConfirm({
  open,
  title,
  busy,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const text = useAdminText();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text('msg.confirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <AButton disabled={busy} onClick={onClose}>
            {text('msg.cancel')}
          </AButton>
          <AButton active disabled={busy} onClick={onConfirm}>
            {text('msg.confirm')}
          </AButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

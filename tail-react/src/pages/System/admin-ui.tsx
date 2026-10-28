import { useSelectedTimezone } from "@/utils/admin/timezone";
import { useCallback, type ReactNode, type KeyboardEventHandler } from "react";
import Button from "@/components/ui/button/Button";
import { useTranslation } from "react-i18next";
export const panelClass =
  "rounded-2xl border border-gray-200 bg-white p-5 text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90";
export const mutedClass = "text-sm text-gray-500 dark:text-gray-400";
export function AButton({
  children,
  testId,
  ariaLabel,
  ariaKeyShortcuts,
  onKeyDown,
  danger = false,
  onClick,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  testId?: string;
  ariaLabel?: string;
  ariaKeyShortcuts?: string;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  danger?: boolean;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      data-testid={testId}
      aria-label={ariaLabel}
      aria-keyshortcuts={ariaKeyShortcuts}
      onKeyDown={onKeyDown}
      type="button"
      size="sm"
      variant={danger ? "danger" : active ? "primary" : "outline"}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
export function useAdminText() {
  const { t } = useTranslation();
  return useCallback(
    (key: string, params: Record<string, string | number> = {}) => {
      let result = String(t(`pc.${key}`));
      for (const [name, replacement] of Object.entries(params))
        result = result.replaceAll(`{${name}}`, String(replacement));
      return result;
    },
    [t],
  );
}
export function useAdminTimezone() {
  return useSelectedTimezone();
}

import { Modal } from "@/components/ui/modal";
import { useEffect, useRef } from "react";
export function AdminDrawer({
  open,
  title,
  onClose,
  children,
  footer,
  bare = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bare?: boolean;
}) {
  const text = useAdminText();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    const root = body.current;
    root?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = root?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[href],[tabindex="0"]',
      );
      if (!controls?.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0],
        last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === root)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root?.addEventListener("keydown", trap);
    return () => {
      root?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [open]);
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabel={title}
      showCloseButton={false}
      className="!fixed inset-y-0 end-0 !h-dvh !w-full !max-w-2xl !rounded-none"
    >
      <div
        ref={body}
        tabIndex={-1}
        data-testid="management-drawer"
        className="flex h-dvh flex-col text-gray-800 outline-none dark:text-white/90"
      >
        {!bare && (
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 p-5 dark:border-gray-800">
            <h2 className="text-lg font-semibold">{title}</h2>
            <AButton onClick={onClose}>{text("system-cards.close")}</AButton>
          </header>
        )}
        <div
          className={
            bare
              ? "min-h-0 flex-1 overflow-hidden"
              : "min-h-0 flex-1 overflow-auto p-5"
          }
          data-testid="management-drawer-body"
        >
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 p-5 dark:border-gray-800">
            {footer}
          </footer>
        )}
      </div>
    </Modal>
  );
}

import SimpleSelect from "./SimpleSelect";
import { useAuth } from "@/context/AuthContext";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import { useSearchParams } from "react-router";
export function ASelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <SimpleSelect
      ariaLabel={label}
      value={value}
      onChange={(value) => onChange(String(value))}
      options={options}
      className="min-w-32"
    />
  );
}
export function useAuditAccess(kind: "login" | "operation") {
  const auth = useAuth();
  const [params] = useSearchParams();
  return {
    identity: auth.user?.id,
    username: params.get("username") ?? "",
    read: auth.canMenu(`/audit/${kind}`),
    export: auth.canButton(`audit.${kind}.export-report`),
    menu: auth.canMenu(`/audit/${kind}`),
  };
}
export function AuditPageFrame({
  title,
  allowed,
  children,
}: {
  title: string;
  allowed: boolean;
  children: ReactNode;
}) {
  const text = useAdminText();
  return (
    <>
      <PageMeta title={`${title} | TailAdmin`} description={title} />
      <PageBreadCrumb pageTitle={title} />
      {allowed ? (
        children
      ) : (
        <p className={panelClass}>{text("audit.noAccess")}</p>
      )}
    </>
  );
}

export function useAdminIdentity() {
  return useAuth().user;
}

import Checkbox from "@/components/form/input/Checkbox";
export function ACheck({
  label,
  showLabel = false,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  showLabel?: boolean;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Checkbox
      ariaLabel={label}
      label={showLabel ? label : undefined}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function AdminConfirm({
  open,
  title,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const text = useAdminText();
  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      ariaLabel={title}
      className="max-w-lg p-6"
    >
      <h2 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
        {title}
      </h2>
      <div className="flex justify-end gap-2">
        <AButton disabled={busy} onClick={onClose}>
          {text("msg.cancel")}
        </AButton>
        <AButton active disabled={busy} onClick={onConfirm}>
          {text("msg.confirm")}
        </AButton>
      </div>
    </Modal>
  );
}

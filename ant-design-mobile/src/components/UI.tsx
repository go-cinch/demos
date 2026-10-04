import {
  useEffect,
  useLayoutEffect,
  useState,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { Popup, Switch, Input, TextArea, SpinLoading, Empty, Button } from 'antd-mobile';
import { t } from '../locales';
import { resolveMessage, type Feedback } from '../lib/form-feedback';
import { preferences } from '../lib/preferences';
import { registerSheet } from '../lib/sheet-history';
const paths: Record<string, ReactNode> = {
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="m3 3 18 18M9 5a10 10 0 0 1 3 0c6 0 10 7 10 7a20 20 0 0 1-3 4M6 6a24 24 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H15v-7H9v7H3z" />
    </>
  ),
  usergroup: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6m3 3a5 5 0 0 1 3 4v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  secured: (
    <>
      <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  app: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="9" r="5" />
      <path d="m12 13 8 8m-3-3 3-3m-6 0 3-3" />
    </>
  ),
  broom: <path d="m15 3-6 9m-2-1 7 4-3 6H3l4-10Zm-1 4-2 6m5-4-2 4" />,
  book: (
    <>
      <path d="M4 4h14v16H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 12h14M7 8h7m-7 4h5" />
    </>
  ),
  'check-rectangle': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m7 12 3 3 7-7" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  'check-double': <path d="m2 12 4 4L14 6m-4 6 4 4 8-10" />,
  delete: (
    <>
      <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7" />
      <path d="M10 11v6m4-6v6" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-down': <path d="m5 9 7 7 7-7" />,
  'chevron-up': <path d="m5 15 7-7 7 7" />,
  'chevron-right-double': <path d="m4 6 6 6-6 6m9-12 6 6-6 6" />,
  search: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m15 15 6 6" />
    </>
  ),
  add: <path d="M12 4v16M4 12h16" />,
  arrow: <path d="M4 12h16m-7-7 7 7-7 7" />,
  moon: <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z" />,
  sunny: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  refresh: <path d="M20 8A9 9 0 1 0 21 14M20 3v5h-5" />,
  'lock-on': (
    <>
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" />
    </>
  ),
  setting: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z" />
    </>
  ),
  notification: <path d="M5 16V9a7 7 0 0 1 14 0v7l2 2H3l2-2m4 5h6" />,
  layers: <path d="m3 7 9-4 9 4-9 4zm0 5 9 4 9-4M3 17l9 4 9-4" />,
  translate: <path d="M2 5h12M8 2v3m-3 0c0 6 5 10 9 11M12 5c0 6-5 10-9 11m11 5 4-12 4 12m-7-4h6" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h4a3 3 0 0 0 3-3c0-4-4-7-9-7z" />
      <path d="M7 8h.01M12 6h.01M6 13h.01M17 8h.01" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M10 3v18" />
    </>
  ),
  mobile: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M10 5h4m-4 14h4" />
    </>
  ),
  'view-list': <path d="M4 6h16M4 12h16M4 18h16" />,
  'view-column': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11M16 9v11" />
    </>
  ),
  ellipsis: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  pin: <path d="m9 3 8 2-2 5 3 4-6 1-4 6 1-7-4-3 5-2z" />,
  cinch: <path d="M18 5a9 9 0 1 0 0 14" />,
};
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.app}
    </svg>
  );
}
export function IconButton({
  name,
  label,
  onClick,
  disabled = false,
  expanded,
  controls,
}: {
  name: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} />
      <span className="icon-label">{label}</span>
    </button>
  );
}
const sheetStack: string[] = [];
const sheetListeners = new Set<() => void>();
const notifySheets = () => sheetListeners.forEach((fn) => fn());
const subscribeSheets = (fn: () => void) => {
  sheetListeners.add(fn);
  return () => {
    sheetListeners.delete(fn);
  };
};
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  top,
  dirty = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode | ((close: () => void) => ReactNode);
  top?: ReactNode;
  dirty?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [bounds, setBounds] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const viewport = window.visualViewport;
      const height = viewport?.height || innerHeight;
      const device = document.querySelector<HTMLElement>('.device');
      const frame = device && innerWidth >= 901 ? device.getBoundingClientRect() : null;
      const border = device?.clientLeft || 0;
      const width = frame ? device!.clientWidth : Math.min(620, innerWidth);
      setBounds({
        width,
        maxWidth: width,
        left: frame ? frame.left + border : (innerWidth - width) / 2,
        right: 'auto',
        bottom: frame
          ? Math.max(0, innerHeight - frame.bottom + border)
          : Math.max(0, innerHeight - height - (viewport?.offsetTop || 0)),
        maxHeight: frame ? device!.clientHeight : Math.max(100, height - 22),
      });
    }
    position();
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
    };
  }, [open]);
  const stack = useSyncExternalStore(subscribeSheets, () => sheetStack.join(','));
  const active = stack.split(',').at(-1) === id;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  function requestClose() {
    if (busy) return false;
    if (dirty) {
      setConfirmDiscard(true);
      return false;
    }
    onClose();
    return true;
  }
  const close = useRef(requestClose);
  close.current = requestClose;
  useEffect(() => {
    if (!open) setConfirmDiscard(false);
  }, [open]);
  useEffect(() => {
    if (open && confirmDiscard) ref.current?.focus();
  }, [open, confirmDiscard]);
  useEffect(() => {
    if (!open || !dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [open, dirty]);
  useEffect(() => {
    if (!open) return;
    const releaseHistory = registerSheet(id, () => close.current());
    sheetStack.push(id);
    notifySheets();
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => ref.current?.focus(), 100);
    function keyboard(e: KeyboardEvent) {
      if (sheetStack.at(-1) !== id) return;
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key === 'Tab') {
        const items = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ].filter((x) => x.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', keyboard, true);
    return () => {
      clearTimeout(timer);
      releaseHistory();
      const index = sheetStack.indexOf(id);
      if (index >= 0) sheetStack.splice(index, 1);
      notifySheets();
      document.removeEventListener('keydown', keyboard, true);
      previous?.focus();
    };
  }, [open]);
  return (
    <Popup
      visible={open}
      style={{ '--z-index': String(2000 + Math.max(0, sheetStack.indexOf(id)) * 20) }}
      onMaskClick={() => close.current()}
      position="bottom"
      destroyOnClose
      getContainer={() => document.body}
      bodyClassName="sheet-popup"
      bodyStyle={bounds}
    >
      <div
        className="sheet"
        style={{ maxHeight: bounds.maxHeight }}
        role="dialog"
        aria-modal="true"
        aria-hidden={!active}
        {...(!active ? ({ inert: '' } as Record<string, string>) : {})}
        aria-labelledby={id}
        tabIndex={-1}
        ref={ref}
        data-sheet="true"
      >
        <div className="sheet-handle" />
        <header className="sheet-heading">
          <h2 id={id}>{confirmDiscard ? t('discardTitle') : title}</h2>
          <IconButton
            name="close"
            label={t('close')}
            disabled={busy}
            onClick={() => close.current()}
          />
        </header>
        {confirmDiscard ? (
          <>
            <div className="sheet-content">
              <p>{t('discardHint')}</p>
            </div>
            <div className="sheet-footer sheet-actions">
              <Button onClick={() => setConfirmDiscard(false)}>{t('keepEditing')}</Button>
              <Button color="danger" onClick={onClose}>
                {t('discard')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {top && <div className="sheet-top">{top}</div>}
            <div className="sheet-content">{children}</div>
            {footer && (
              <div className="sheet-footer">
                {typeof footer === 'function' ? footer(() => close.current()) : footer}
              </div>
            )}
          </>
        )}
      </div>
    </Popup>
  );
}
export function Field({
  name,
  label,
  error,
  hint,
  required,
  warning,
  children,
}: {
  name: string;
  label: string;
  error?: Feedback;
  hint?: string;
  required?: boolean;
  warning?: boolean;
  children: ReactNode;
}) {
  const feedback = resolveMessage(error);
  return (
    <div className={`field ${feedback ? (warning ? 'warning' : 'invalid') : ''}`}>
      <label htmlFor={name}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && <small className="muted">{hint}</small>}
      {feedback && (
        <p id={`${name}-error`} className="field-error" role="alert">
          {feedback}
        </p>
      )}
    </div>
  );
}
export function TextField({
  name,
  label,
  value,
  onChange,
  error,
  type = 'text',
  hint,
  multiline = false,
  required = false,
  onBlur,
  autoComplete,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: Feedback;
  type?: 'text' | 'password';
  hint?: string;
  multiline?: boolean;
  required?: boolean;
  onBlur?: () => void;
  autoComplete?: string;
}) {
  const props = {
    id: name,
    name,
    value,
    onChange,
    onBlur,
    'aria-invalid': !!error,
    'aria-describedby': error ? `${name}-error` : undefined,
  };
  return (
    <Field name={name} label={label} error={error} hint={hint} required={required}>
      {multiline ? (
        <TextArea {...props} autoSize={{ minRows: 3, maxRows: 8 }} />
      ) : type === 'password' ? (
        <PasswordInput {...props} autoComplete={autoComplete || 'new-password'} />
      ) : (
        <Input
          {...props}
          type={type}
          autoComplete={autoComplete || (name.includes('username') ? 'username' : 'off')}
        />
      )}
    </Field>
  );
}
export function PasswordInput(props: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoComplete?: string;
  placeholder?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        autoComplete={props.autoComplete || 'new-password'}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={t(visible ? 'hidePassword' : 'showPassword')}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={20} />
      </button>
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="switch-row">
      <span>{label}</span>
      <Switch checked={checked} onChange={onChange} aria-label={label} disabled={disabled} />
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="loading">
      <SpinLoading color="primary" />
      <span>{t('loading')}</span>
    </div>
  );
}
export function NoData({ text }: { text?: string }) {
  return <Empty description={text || t('noData')} />;
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
      {retry && <button onClick={retry}>{t('retry')}</button>}
    </div>
  ) : null;
}
function safeLink(value: string) {
  return /^https?:\/\//i.test(value) ? value : undefined;
}
export function Copyright() {
  const p = preferences;
  return p.footer && p.copyright ? (
    <footer className="copyright">
      Copyright © {p.copyrightDate || new Date().getFullYear()}{' '}
      <a href={safeLink(p.companyLink)} target="_blank" rel="noreferrer">
        {p.company}
      </a>
      {p.icp && (
        <a href={safeLink(p.icpLink)} target="_blank" rel="noreferrer">
          {p.icp}
        </a>
      )}
    </footer>
  ) : null;
}

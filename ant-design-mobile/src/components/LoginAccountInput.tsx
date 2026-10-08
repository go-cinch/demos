import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Input, type InputRef } from 'antd-mobile';
import { clearLoginAccountHistory, loginAccountHistory, removeLoginAccount } from '../lib/storage';
import { t } from '../locales';
import { Icon } from './UI';
export default function LoginAccountInput({
  value,
  onChange,
  onBlur,
  onSelect,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  onSelect: () => void;
  invalid: boolean;
}) {
  const identity = useId();
  const root = useRef<HTMLDivElement>(null);
  const control = useRef<InputRef>(null);
  const [history, setHistory] = useState(loginAccountHistory);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim();
  const items = history.filter((account) => account.toLowerCase().includes(query.toLowerCase()));
  useLayoutEffect(() => {
    const input = control.current?.nativeElement;
    if (!input) return;
    // Ant Mobile forwards only a subset of ARIA attributes to its native input.
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', String(focused && history.length > 0));
    input.setAttribute('aria-controls', `${identity}-accounts`);
    input.setAttribute('aria-required', 'true');
    input.setAttribute('aria-invalid', String(invalid));
    input.setAttribute('spellcheck', 'false');
    if (focused && active >= 0)
      input.setAttribute('aria-activedescendant', `${identity}-account-${active}`);
    else input.removeAttribute('aria-activedescendant');
    if (invalid) input.setAttribute('aria-describedby', 'username-error');
    else input.removeAttribute('aria-describedby');
  }, [focused, history.length, active, invalid, identity]);
  function pick(account: string) {
    onChange(account);
    onSelect();
    root.current?.querySelector('input')?.focus();
    setFocused(false);
    setActive(-1);
    onBlur(account);
  }
  function keydown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setFocused(false);
      setActive(-1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setFocused(true);
      if (!items.length) return;
      const next =
        active < 0
          ? event.key === 'ArrowDown'
            ? 0
            : items.length - 1
          : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      setActive(next);
      requestAnimationFrame(() =>
        document
          .getElementById(`${identity}-account-${next}`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'Enter' && focused && active >= 0 && items[active]) {
      event.preventDefault();
      event.stopPropagation();
      pick(items[active]!);
    }
  }
  function highlighted(account: string) {
    const index = query ? account.toLowerCase().indexOf(query.toLowerCase()) : -1;
    return index < 0 ? (
      account
    ) : (
      <>
        {account.slice(0, index)}
        <mark>{account.slice(index, index + query.length)}</mark>
        {account.slice(index + query.length)}
      </>
    );
  }
  return (
    <div
      ref={root}
      className="login-account-field"
      onKeyDownCapture={keydown}
      onBlur={(event) => {
        if (root.current?.contains(event.relatedTarget as Node | null)) return;
        setFocused(false);
        setActive(-1);
        onBlur(value);
      }}
    >
      <Input
        ref={control}
        id="username"
        name="username"
        value={value}
        autoComplete="off"
        autoCapitalize="none"
        clearable
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={focused && history.length > 0}
        aria-controls={`${identity}-accounts`}
        aria-activedescendant={focused && active >= 0 ? `${identity}-account-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'username-error' : undefined}
        placeholder={t('app.validation.username')}
        onChange={(account) => {
          onChange(account);
          setFocused(true);
          setActive(-1);
        }}
        onFocus={() => {
          setHistory(loginAccountHistory());
          setFocused(true);
        }}
      />
      {focused && history.length > 0 && (
        <div
          className="suggestions card account-suggestions"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="account-history-heading">
            <small>{t('loginAccountHistory')}</small>
            <button
              type="button"
              onClick={() => {
                setHistory(clearLoginAccountHistory());
                root.current?.querySelector('input')?.focus();
                setFocused(false);
                setActive(-1);
              }}
            >
              {t('clearLoginAccountHistory')}
            </button>
          </div>
          <div id={`${identity}-accounts`} role="listbox" aria-label={t('loginAccountHistory')}>
            {!items.length && (
              <p className="account-history-empty">{t('loginAccountHistoryEmpty')}</p>
            )}
            {items.map((account, index) => (
              <div
                className={`suggestion-row ${active === index ? 'account-active' : ''}`}
                key={account}
              >
                <button
                  id={`${identity}-account-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  onClick={() => pick(account)}
                >
                  {highlighted(account)}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('system.suggestions.removeHistory', { value: account })}
                  onClick={() => {
                    setHistory(removeLoginAccount(account));
                    setActive(-1);
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { Button } from 'antd-mobile';
import { preferences as p } from '../lib/preferences';
import { t } from '../locales';
import { Sheet, Field, TextField, Toggle, Icon } from './UI';
export function Choices({
  value,
  onChange,
  options,
}: {
  value: string | number;
  onChange: (v: string | number) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div className="choice-group" role="radiogroup" aria-label={t('choose')}>
      {options.map((x, index) => (
        <button
          key={x.value}
          type="button"
          role="radio"
          className="choice-option"
          aria-checked={value === x.value}
          tabIndex={
            value === x.value || (!options.some((o) => o.value === value) && index === 0) ? 0 : -1
          }
          onClick={() => onChange(x.value)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
              next = (index + 1) % options.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
              next = (index + options.length - 1) % options.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = options.length - 1;
            else return;
            event.preventDefault();
            onChange(options[next].value);
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
              [next]?.focus();
          }}
        >
          <span className="choice-dot" aria-hidden="true">
            {value === x.value && <Icon name="check" size={14} />}
          </span>
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Settings({
  open,
  onClose,
  showLoginPosition,
}: {
  open: boolean;
  onClose: () => void;
  showLoginPosition: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('settings')}
      footer={
        <Button block color="primary" onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <h3>{t('appearance')}</h3>
      <Toggle label={t('dark')} checked={p.dark} onChange={(v) => (p.dark = v)} />
      <Toggle
        label={t('reduced')}
        checked={p.reducedTransparency}
        onChange={(v) => (p.reducedTransparency = v)}
      />
      <Field name="accent" label={t('color')}>
        <Choices
          value={p.accent}
          onChange={(v) => (p.accent = String(v))}
          options={[
            { value: 'garnet', label: t('garnet') },
            { value: 'green', label: t('green') },
            { value: 'violet', label: t('violet') },
          ]}
        />
      </Field>
      {showLoginPosition && (
        <Field name="login-position" label={t('panel')} hint={t('desktopPositionHint')}>
          <Choices
            value={p.loginPosition}
            onChange={(v) => (p.loginPosition = String(v))}
            options={['left', 'center', 'right'].map((value) => ({ value, label: t(value) }))}
          />
        </Field>
      )}
      <h3>{t('layout')}</h3>
      <Toggle label={t('footer')} checked={p.footer} onChange={(v) => (p.footer = v)} />
      <section className="copyright-settings">
        <h3>{t('copyright')}</h3>
        <Toggle
          label={t('copyrightEnabled')}
          checked={p.copyright}
          onChange={(v) => (p.copyright = v)}
        />
        <TextField
          name="copyright-date"
          label={t('copyrightDate')}
          hint={t('autoYear')}
          value={p.copyrightDate}
          onChange={(v) => (p.copyrightDate = v)}
        />
        <TextField
          name="company"
          label={t('company')}
          value={p.company}
          onChange={(v) => (p.company = v)}
        />
        <TextField
          name="company-link"
          label={t('companyLink')}
          value={p.companyLink}
          onChange={(v) => (p.companyLink = v)}
        />
        <TextField name="icp" label={t('icp')} value={p.icp} onChange={(v) => (p.icp = v)} />
        <TextField
          name="icp-link"
          label={t('icpLink')}
          value={p.icpLink}
          onChange={(v) => (p.icpLink = v)}
        />
      </section>
    </Sheet>
  );
}

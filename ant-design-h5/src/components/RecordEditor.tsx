import { useId, useRef, useState } from 'react';
import { Button, Switch, Input, TextArea } from 'antd-mobile';
import { ApiError, saveResource } from '../lib/api';
import { configs } from '../lib/resource-config';
import { buildChangedPayload } from '../lib/update-payload';
import { dictionaryKeyValid, nonempty } from '../lib/validation';
import type { RecordData, ResourceKind } from '../lib/types';
import { t } from '../locales';
import { Sheet, Field, TextField, ErrorBox, PasswordInput } from './UI';
import RemoteSelect from './RemoteSelect';
import { focusFirstError } from '../lib/form-focus';
import { message, type Feedback } from '../lib/form-feedback';
export default function RecordEditor({
  resource,
  record,
  onClose,
  onSaved,
}: {
  resource: ResourceKind;
  record: RecordData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = configs.value[resource];
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef<Record<string, unknown>>();
  if (!initial.current) {
    const f: Record<string, unknown> = {};
    for (const field of config.fields) {
      let value =
        record && Object.hasOwn(record, field.key)
          ? record[field.key]
          : (field.defaultValue ??
            (field.type.endsWith('-select')
              ? field.type === 'role-select'
                ? undefined
                : []
              : ''));
      if (field.type === 'json' && record) value = JSON.stringify(value, null, 2);
      if (field.key === 'user_ids') value = record?.users?.map((x) => x.id) || [];
      if (field.key === 'password') value = '';
      f[field.key] = value;
    }
    if (resource === 'user') {
      f.display_name = record?.metadata?.display_name || '';
      f.department = record?.metadata?.department || '';
    }
    initial.current = f;
  }
  const [form, setForm] = useState(initial.current),
    [errors, setErrors] = useState<Record<string, Feedback>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const set = (key: string, v: unknown) => setForm((f) => ({ ...f, [key]: v }));
  function normalized(source: Record<string, unknown>) {
    const value = { ...source };
    if (resource === 'dictionary') value.value = JSON.parse(String(value.value));
    for (const key of ['username', 'name', 'word', 'key', 'group'])
      if (typeof value[key] === 'string') value[key] = (value[key] as string).trim();
    if (resource === 'user') {
      if (typeof value.password === 'string') value.password = value.password.trim();
      value.role_id = Number(value.role_id || 0);
      if (!value.password) delete value.password;
      const metadata = { ...record?.metadata };
      for (const key of ['display_name', 'department']) {
        if (value[key]) metadata[key] = value[key];
        else delete metadata[key];
        delete value[key];
      }
      if (Object.keys(metadata).length || record?.metadata) value.metadata = metadata;
    }
    return value;
  }
  async function submit() {
    if (busy) return;
    setError('');
    const e: Record<string, Feedback> = {};
    for (const field of config.fields)
      if (
        (field.required || (!record && field.createRequired)) &&
        (form[field.key] === undefined || !String(form[field.key]).trim())
      )
        e[field.key] = message('system.validation.required', { field: field.label });
    if (resource === 'user') {
      if (!nonempty(form.username)) e.username = message('app.validation.username');
      if ((!record || form.password) && !nonempty(form.password))
        e.password = message('app.validation.password');
    }
    if (resource === 'dictionary') {
      if (!dictionaryKeyValid(String(form.key))) e.key = message('system.validation.dictionaryKey');
      try {
        JSON.parse(String(form.value));
      } catch {
        e.value = message('system.validation.json');
      }
    }
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError(formRef.current);
      return;
    }
    let payload = normalized(form);
    if (record) payload = buildChangedPayload(normalized(initial.current!), payload);
    if (!Object.keys(payload).length) {
      setError(t('system.messages.noChanges'));
      return;
    }
    setBusy(true);
    try {
      await saveResource(resource, payload, record?.id, idempotency.current);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status !== 409) idempotency.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      dirty={JSON.stringify(form) !== JSON.stringify(initial.current)}
      busy={busy}
      footer={(close) => (
        <div className="sheet-actions">
          <Button disabled={busy} onClick={close}>
            {t('cancel')}
          </Button>
          <Button color="primary" type="submit" form={formId} loading={busy}>
            {t(record ? 'save' : 'system.common.create')}
          </Button>
        </div>
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t(record ? 'system.common.editTitle' : 'system.common.createTitle', {
        entity: config.entity,
      })}
    >
      <form
        id={formId}
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {config.fields
          .filter((f) => record || f.createVisible !== false)
          .map((f) => (
            <Field
              key={f.key}
              name={`edit-${f.key}`}
              label={record && f.editLabel ? f.editLabel : f.label}
              error={errors[f.key]}
              required={f.required || (!record && f.createRequired)}
              hint={record ? f.editPlaceholder : undefined}
            >
              {f.type === 'enabled' ? (
                <Switch
                  checked={Boolean(form[f.key])}
                  onChange={(v) => set(f.key, v)}
                  aria-label={f.label}
                />
              ) : f.type.endsWith('-select') || f.type === 'action-group' ? (
                <RemoteSelect
                  name={`edit-${f.key}`}
                  label={f.label}
                  value={form[f.key]}
                  onChange={(v) => set(f.key, v)}
                  resource={
                    f.type === 'role-select'
                      ? 'role'
                      : f.type === 'user-select'
                        ? 'user'
                        : f.type === 'action-select'
                          ? 'action'
                          : undefined
                  }
                  multiple={['action-select', 'user-select'].includes(f.type)}
                  group={f.type === 'action-group'}
                  initial={
                    f.type === 'role-select'
                      ? record?.role
                        ? [
                            {
                              value: record.role.id,
                              label: `${record.role.name} · ${record.role.word}`,
                            },
                          ]
                        : []
                      : f.type === 'user-select'
                        ? record?.users?.map((x) => ({
                            value: x.id,
                            label: `${x.username} · ${x.code}`,
                          }))
                        : record?.actions?.map((x) => ({
                            value: x.code,
                            label: `${x.name} · ${x.word}`,
                          }))
                  }
                />
              ) : f.type === 'category' ? (
                <RemoteSelect
                  name={`edit-${f.key}`}
                  label={f.label}
                  value={form[f.key]}
                  onChange={(v) => set(f.key, v)}
                  options={[
                    { value: 0, label: t('system.category.permission') },
                    { value: 1, label: t('system.category.jwt') },
                  ]}
                />
              ) : ['textarea', 'json'].includes(f.type) ? (
                <TextArea
                  id={`edit-${f.key}`}
                  name={f.key}
                  value={String(form[f.key] ?? '')}
                  onChange={(v) => set(f.key, v)}
                  className={f.type === 'json' ? 'json-editor' : ''}
                  autoSize={{ minRows: 3, maxRows: 9 }}
                  aria-invalid={!!errors[f.key]}
                  aria-describedby={errors[f.key] ? `edit-${f.key}-error` : undefined}
                />
              ) : f.type === 'password' ? (
                <PasswordInput
                  id={`edit-${f.key}`}
                  name={f.key}
                  value={String(form[f.key] ?? '')}
                  onChange={(v) => set(f.key, v)}
                  aria-invalid={!!errors[f.key]}
                  aria-describedby={errors[f.key] ? `edit-${f.key}-error` : undefined}
                  placeholder={record ? f.editPlaceholder : undefined}
                />
              ) : (
                <Input
                  id={`edit-${f.key}`}
                  name={f.key}
                  value={String(form[f.key] ?? '')}
                  type="text"
                  autoComplete={f.key === 'username' ? 'username' : 'off'}
                  onChange={(v) => set(f.key, v)}
                  aria-invalid={!!errors[f.key]}
                  aria-describedby={errors[f.key] ? `edit-${f.key}-error` : undefined}
                  placeholder={
                    record && f.editPlaceholder
                      ? f.editPlaceholder
                      : t('system.common.enter', { field: f.label })
                  }
                />
              )}
            </Field>
          ))}
        {resource === 'user' && (
          <>
            <TextField
              name="edit-display_name"
              label={t('displayName')}
              value={String(form.display_name || '')}
              onChange={(v) => set('display_name', v)}
            />
            {record && (
              <TextField
                name="edit-department"
                label={t('department')}
                value={String(form.department || '')}
                onChange={(v) => set('department', v)}
              />
            )}
          </>
        )}
        <ErrorBox error={error} />
      </form>
    </Sheet>
  );
}

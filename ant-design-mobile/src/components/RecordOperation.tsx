import { useId, useRef, useState } from 'react';
import { Button, TextArea } from 'antd-mobile';
import dayjs from 'dayjs';
import { saveResource, deleteResources } from '../lib/api';
import { dateTime, parseDateTime, labelFor } from '../lib/format';
import type { ResourceKind, RecordData } from '../lib/types';
import { t } from '../locales';
import { Sheet, Field, ErrorBox } from './UI';
import { Choices } from './Settings';
import { focusFirstError } from '../lib/form-focus';
import DateTimeField from './DateTimeField';
import { message, type Feedback } from '../lib/form-feedback';
export default function RecordOperation({
  operation,
  resource,
  record,
  ids,
  onClose,
  onSaved,
}: {
  operation: string;
  resource: ResourceKind;
  record: RecordData | null;
  ids: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [warning, setWarning] = useState<Feedback>(''),
    [decision, setDecision] = useState('approve'),
    [reason, setReason] = useState(''),
    [mode, setMode] = useState('until'),
    [until, setUntil] = useState(dateTime(dayjs().add(1, 'day').valueOf()));
  async function submit() {
    if (busy) return;
    setError('');
    setWarning('');
    if (operation === 'review' && decision === 'reject' && !reason.trim()) {
      setWarning(message('system.validation.rejectionRequired'));
      focusFirstError(formRef.current);
      return;
    }
    const date = parseDateTime(until);
    if (operation === 'lock' && mode === 'until' && (!date.isValid() || !date.isAfter(dayjs()))) {
      setWarning(message('system.validation.futureLock'));
      focusFirstError(formRef.current);
      return;
    }
    setBusy(true);
    try {
      if (operation === 'delete') await deleteResources(resource, ids);
      else if (record) {
        const metadata = { ...record.metadata };
        let status = record.status;
        if (operation === 'review') {
          if (decision === 'approve') delete metadata.reject_register_reason;
          else metadata.reject_register_reason = reason.trim();
          status = decision === 'approve' ? 1 : 0;
        }
        if (operation === 'lock') {
          metadata.lock_expired_at = mode === 'permanent' ? 0 : date.valueOf();
          status = 2;
        }
        if (operation === 'unlock') {
          delete metadata.lock_expired_at;
          status = 1;
        }
        if (operation === 'unlockPassword') delete metadata.password_change_failures;
        await saveResource(
          'user',
          { metadata, ...(operation === 'unlockPassword' ? {} : { status }) },
          record.id,
        );
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      busy={busy}
      footer={(close) => (
        <div className="sheet-actions">
          <Button disabled={busy} onClick={close}>
            {t('cancel')}
          </Button>
          <Button
            color={operation === 'delete' ? 'danger' : 'primary'}
            type="submit"
            form={formId}
            loading={busy}
          >
            {operation === 'delete'
              ? ids.length > 1
                ? t('deleteCount', { count: ids.length })
                : t('system.common.delete')
              : t('confirm')}
          </Button>
        </div>
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        operation === 'delete'
          ? record
            ? t('system.confirm.delete', { name: labelFor(record) })
            : t('system.confirm.deleteSelected')
          : t(`system.user.${operation}`)
      }
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
        {record && operation !== 'delete' && (
          <p className="operation-subject">
            <strong>{labelFor(record)}</strong>
            <span>{record.code || `#${record.id}`}</span>
          </p>
        )}
        {operation === 'review' ? (
          <>
            <Field name="review-decision" label={t('system.user.decision')}>
              <Choices
                value={decision}
                onChange={(v) => setDecision(String(v))}
                options={['approve', 'reject'].map((value) => ({
                  value,
                  label: t(`system.user.${value}`),
                }))}
              />
            </Field>
            {decision === 'reject' && (
              <Field name="reject-reason" label={t('system.user.reason')} error={warning} warning>
                <TextArea
                  id="reject-reason"
                  name="reject_reason"
                  value={reason}
                  onChange={setReason}
                />
              </Field>
            )}
          </>
        ) : operation === 'lock' ? (
          <>
            <Field name="lock-mode" label={t('system.user.lockType')}>
              <Choices
                value={mode}
                onChange={(v) => setMode(String(v))}
                options={[
                  { value: 'until', label: t('system.user.lockUntil') },
                  { value: 'permanent', label: t('system.user.permanent') },
                ]}
              />
            </Field>
            {mode === 'until' && (
              <Field name="lock-until" label={t('system.user.lockedUntil')} error={warning} warning>
                <DateTimeField
                  id="lock-until"
                  name="lock_until"
                  value={until}
                  onChange={setUntil}
                />
              </Field>
            )}
          </>
        ) : (
          <p>
            {operation === 'delete'
              ? t('system.confirm.deleteDescription', { count: ids.length })
              : t(`system.confirm.${operation}`, { name: record ? labelFor(record) : '' })}
          </p>
        )}
        <ErrorBox error={error} />
      </form>
    </Sheet>
  );
}

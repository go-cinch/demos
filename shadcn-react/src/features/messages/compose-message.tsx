'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/lib/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { RelationPicker } from '@/features/system/components/record-selects';
import { msgApi, msgChanged } from './api/service';
import type { MsgInput } from './api/types';
import { useMsgLocale } from './locale';
import { useLocale } from '@/features/i18n/locale-context';
import { parseDateTime } from './date-time';
const loadRecipients = async (q: string) =>
  (await msgApi.users(q)).map((u) => ({ value: u.id, label: u.username }));
export default function ComposeMessage({ close, saved }: { close: () => void; saved: () => void }) {
  const tr = useMsgLocale(),
    { locale, timezone } = useLocale(),
    zone = timezone === 'local' ? new Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;
  const [error, setError] = useState(''),
    [discard, setDiscard] = useState(false),
    [attempted, setAttempted] = useState(false);
  const sendKey = useRef(''),
    lastPayload = useRef('');
  const form = useAppForm({
    defaultValues: {
      title: '',
      content: '',
      type: 'notice',
      scope: 'all',
      recipient_ids: [] as number[],
      expiry: ''
    },
    onSubmit: async ({ value }) => {
      setError('');
      const payload: MsgInput = {
        title: value.title,
        content: value.content,
        type: value.type as MsgInput['type'],
        scope: value.scope as MsgInput['scope'],
        recipient_ids: value.scope === 'targeted' ? value.recipient_ids : [],
        expired_at: value.expiry ? parseDateTime(value.expiry, zone) : null
      };
      const serialized = JSON.stringify(payload);
      if (lastPayload.current !== serialized) {
        lastPayload.current = serialized;
        sendKey.current = crypto.randomUUID();
      }
      try {
        await msgApi.send(payload, sendKey.current);
        msgChanged();
        saved();
      } catch (e) {
        setError((e as Error).message);
      }
    }
  });
  const scope = useStore(form.store, (s) => s.values.scope),
    dirty = useStore(form.store, (s) => s.isDirty),
    busy = useStore(form.store, (s) => s.isSubmitting);
  useEffect(() => {
    if (attempted) void form.validateAllFields('submit');
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- repaint submitted validation errors when the application locale changes
  }, [locale, attempted, form]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  function requestClose() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else close();
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'
        >
          <DialogHeader>
            <DialogTitle>{tr('send')}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setAttempted(true);
              void form.handleSubmit();
            }}
          >
            <fieldset disabled={busy} className='space-y-4'>
              <form.AppField
                name='title'
                validators={{
                  onSubmit: ({ value }) =>
                    !value.trim() || [...value.trim()].length > 200
                      ? { message: tr('titleError') }
                      : undefined
                }}
              >
                {(field) => <field.TextField label={tr('title')} required />}
              </form.AppField>
              <form.AppField
                name='content'
                validators={{
                  onSubmit: ({ value }) =>
                    !value.trim() || [...value.trim()].length > 20000
                      ? { message: tr('contentError') }
                      : undefined
                }}
              >
                {(field) => <field.TextareaField label={tr('content')} required rows={5} />}
              </form.AppField>
              <form.AppField name='type'>
                {(field) => (
                  <field.SelectField
                    label={tr('type')}
                    options={['system', 'notice'].map((value) => ({
                      value,
                      label: tr(value)
                    }))}
                  />
                )}
              </form.AppField>
              <form.AppField name='scope'>
                {(field) => (
                  <field.SelectField
                    label={tr('scope')}
                    options={['all', 'targeted'].map((value) => ({
                      value,
                      label: tr(value)
                    }))}
                  />
                )}
              </form.AppField>
              {scope === 'targeted' && (
                <form.Field
                  name='recipient_ids'
                  validators={{
                    onSubmit: ({ value }) =>
                      !value.length || value.length > 1000
                        ? { message: tr('recipientError') }
                        : undefined
                  }}
                >
                  {(field) => (
                    <div>
                      <RelationPicker
                        field={{
                          key: 'msg-recipients',
                          label: tr('recipients')
                        }}
                        resource='user'
                        multiple
                        value={field.state.value}
                        onChange={(v) => field.handleChange(v as number[])}
                        loadOptions={loadRecipients}
                      />
                      {field.state.meta.errors.map((err, i) => (
                        <p key={i} className='text-destructive' role='alert'>
                          {err?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>
              )}
              <form.AppField
                name='expiry'
                validators={{
                  onSubmit: ({ value }) =>
                    value &&
                    (!Number.isFinite(parseDateTime(value, zone)) ||
                      parseDateTime(value, zone) <= Date.now())
                      ? { message: tr('expiryError') }
                      : undefined
                }}
              >
                {(field) => <field.TextField type='datetime-local' label={tr('expiry')} />}
              </form.AppField>
              {error && (
                <p role='alert' className='text-destructive'>
                  {error}
                </p>
              )}
            </fieldset>
            <DialogFooter className='mt-5'>
              <Button type='button' variant='outline' disabled={busy} onClick={requestClose}>
                {tr('cancel')}
              </Button>
              <Button type='submit' disabled={busy} aria-busy={busy}>
                {tr('send')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={discard} onOpenChange={setDiscard}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{tr('confirm')}</DialogTitle>
          </DialogHeader>
          <p>{tr('unsaved')}</p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDiscard(false)}>
              {tr('cancel')}
            </Button>
            <Button onClick={close}>{tr('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

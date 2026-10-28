'use client';
import SentSummary from './sent-summary';
import { messagePermissions } from './permissions';
import SentWorkspace from './sent-workspace';
import MessageSearch from './message-search';

import InboxFeed from './inbox-feed';
import { AdminDrawer, AButton, ASelect, useAdminText } from '@/features/system/components/admin-ui';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { useLocale } from '@/features/i18n/locale-context';
import { StyledSelect } from '@/features/system/components/record-selects';
import ResultToolbar, { type Density } from '@/features/system/components/result-toolbar';
import { cn } from '@/lib/utils';
import { useMessages } from './use-messages';
import { useMsgLocale } from './locale';
import { formatDateTime } from './date-time';
import ComposeMessage from './compose-message';
function LegacyMessagePage({
  sent = false,
  embedded = false,
  onClose
}: {
  sent?: boolean;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const auth = useAuth(),
    tr = useMsgLocale(),
    { pick, timezone } = useLocale(),
    router = useRouter();
  const closeHistory = () => (onClose ? onClose() : router.replace('/dashboard/overview'));
  const zone =
    timezone === 'local' ? new Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;
  const permissions = messagePermissions(auth.user);
  const readable = sent ? permissions.read : permissions.inbox,
    deletable = permissions.control(sent, 'delete');
  const [sentView, setSentView] = useState('split'),
    [summaryRevision, setSummaryRevision] = useState(0);
  const [visible, setVisible] = useState(['type', 'scope', 'published_at']);
  const fields = [...new Set(['id', 'title', ...visible, ...(sent ? ['expired_at'] : ['read_at']),
    ...(sent && sentView === 'split' ? ['summary'] : [])])].join(',');
  const m = useMessages(sent, readable, fields);
  const text = useAdminText();
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const checkedVisible = checkedKeys.filter((id) => m.rows.some((row) => row.id === id));
  const allChecked = m.rows.length > 0 && checkedVisible.length === m.rows.length;
  const partial = checkedVisible.length > 0 && !allChecked;
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- reset row selection when the result-page context changes
    setCheckedKeys([]);
  }, [sent, m.page, m.size, m.type, m.status]);
  const [density, setDensity] = useState<Density>('default');
  const [bordered, setBordered] = useState(true),
    [striped, setStriped] = useState(true),
    [sticky, setSticky] = useState(true),
    [fullscreen, setFullscreen] = useState(false);
  const body = (
    <div
      className={cn(
        'space-y-5',
        fullscreen && 'fixed inset-0 z-40 overflow-auto bg-background p-6'
      )}
    >
      {sent && <SentSummary allowed={readable} revision={summaryRevision} />}
      {readable && (<form
        noValidate
        className='flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4'
        onSubmit={(e) => {
          e.preventDefault();
          void m.load();
        }}
      >
        {sent && (
          <>
            <MessageSearch value={m.query} onSearch={m.setQuery} />
            <label className='space-y-2'>
              <span className='text-sm'>{text('msg.scope')}</span>
              <ASelect
                label={text('msg.scope')}
                value={m.scope}
                onChange={m.setScope}
                options={['', 'all', 'targeted'].map((value) => ({
                  value,
                  label: text(`msg.${value || 'allScopes'}`)
                }))}
              />
            </label>
          </>
        )}
        {!sent && (
          <div className='w-60 space-y-2'>
            <Label>{tr('read')}</Label>
            <StyledSelect
              ariaLabel={tr('read')}
              value={m.status}
              onChange={m.setStatus}
              options={['', 'unread', 'read'].map((value) => ({
                value,
                label: tr(value || 'allStatus')
              }))}
            />
          </div>
        )}
        <div className='w-60 space-y-2'>
          <Label>{tr('type')}</Label>
          <StyledSelect
            ariaLabel={tr('type')}
            value={m.type}
            onChange={m.setType}
            options={['', 'system', 'notice'].map((value) => ({
              value,
              label: tr(value || 'allTypes')
            }))}
          />
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            m.setType('');
            m.setStatus('');
            m.setQuery('');
            m.setScope('');
          }}
        >
          {pick('Reset', '重置')}
        </Button>
        <Button type='submit'>{pick('Search', '查询')}</Button>
      </form>)}
      <div className='rounded-lg border bg-card p-4'>
        <div className='mb-4 flex flex-wrap items-center gap-2'>
          {sent && permissions.send && <Button onClick={m.newMessage}>{tr('send')}</Button>}
          {!sent && permissions.control(false, 'read-all') && (
            <Button disabled={m.busy || m.loading} onClick={() => void m.readAll()}>
              {tr('readAll')}
            </Button>
          )}
          {readable && checkedVisible.length > 0 && (
            <>
              {permissions.control(sent, 'delete-selected') && (
                <Button
                  data-testid='message-bulk-delete'
                  variant='destructive'
                  disabled={m.busy || m.loading}
                  onClick={() => m.requestBulk(checkedVisible, 'deleteSelected')}
                >
                  {tr('deleteSelected')}
                </Button>
              )}
              {!sent && permissions.control(false, 'mark-selected-read') && (
                <Button
                  data-testid='message-bulk-read'
                  variant='outline'
                  disabled={m.busy || m.loading}
                  onClick={() => m.requestBulk(checkedVisible, 'readSelected')}
                >
                  {tr('markRead')}
                </Button>
              )}
            </>
          )}
          <div className='ms-auto flex gap-2'>
            {['split', 'table'].map((view) => (
              <AButton key={view} active={sentView === view} onClick={() => setSentView(view)}>
                {text(view === 'split' ? 'msg.splitView' : 'msg.tableView')}
              </AButton>
            ))}
          </div>
          <span className='text-sm text-muted-foreground'>
            {pick(`${m.total} records`, `共 ${m.total} 条记录`)}
          </span>
          <ResultToolbar
            loading={m.loading}
            refresh={() => {
              setSummaryRevision((value) => value + 1);
              void m.load();
            }}
            density={density}
            setDensity={setDensity}
            fullscreen={embedded || fullscreen}
            toggleFullscreen={() => (embedded ? closeHistory() : setFullscreen((v) => !v))}
            bordered={bordered}
            setBordered={setBordered}
            striped={striped}
            setStriped={setStriped}
            sticky={sticky}
            setSticky={setSticky}
          >
            {['type', 'scope', 'published_at'].map((key) => (
              <label className='flex items-center gap-2' key={key}>
                <Checkbox
                  checked={visible.includes(key)}
                  onCheckedChange={(v) =>
                    setVisible((all) => (v ? [...all, key] : all.filter((k) => k !== key)))
                  }
                />
                {tr(key === 'published_at' ? 'published' : key)}
              </label>
            ))}
          </ResultToolbar>
        </div>

        {!readable ? (
          <p>{tr('noPermission')}</p>
        ) : m.error ? (
          <div role='alert'>
            {m.error}
            <Button variant='outline' onClick={() => void m.load()}>
              {tr('retry')}
            </Button>
          </div>
        ) : sentView === 'split' ? (
          <SentWorkspace
            rows={m.rows}
            loading={m.loading}
            checked={checkedVisible}
            onCheck={setCheckedKeys}
            onView={(row) => void m.openDetail(row)}
            onDelete={deletable ? m.remove : undefined}
            visible={visible}
            density={density}
          />
        ) : (
          <Table aria-busy={m.loading} className={cn(bordered && '[&_td]:border [&_th]:border')}>
            <TableHeader className={cn(sticky && 'sticky top-0 bg-muted')}>
              <TableRow>
                <TableHead>
                  <Checkbox
                    aria-label={tr('selectAll')}
                    checked={allChecked}
                    indeterminate={partial}
                    disabled={m.loading || !m.rows.length}
                    onCheckedChange={(value) =>
                      setCheckedKeys(value ? m.rows.map((row) => row.id) : [])
                    }
                  />
                </TableHead>
                {['title', ...visible, ...(!sent ? ['read_at'] : []), 'actions'].map((key) => (
                  <TableHead key={key}>
                    {tr(key === 'published_at' ? 'published' : key === 'read_at' ? 'read' : key)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.rows.map((row, index) => (
                <TableRow key={row.id} className={cn(striped && index % 2 === 1 && 'bg-muted/50')}>
                  <TableCell>
                    <Checkbox
                      aria-label={`${tr('select')} ${row.title}`}
                      checked={checkedVisible.includes(row.id)}
                      disabled={m.loading}
                      onCheckedChange={(value) =>
                        setCheckedKeys((all) =>
                          value ? [...all, row.id] : all.filter((id) => id !== row.id)
                        )
                      }
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'max-w-80 break-words',
                      density === 'compact' ? 'py-1' : density === 'loose' ? 'py-6' : 'py-3'
                    )}
                  >
                    <Button
                      variant='link'
                      className='h-auto whitespace-normal text-start'
                      onClick={() => void m.openDetail(row)}
                    >
                      {row.title}
                    </Button>
                    {row.expired_at && row.expired_at <= m.now && (
                      <Badge variant='secondary'>{tr('expired')}</Badge>
                    )}
                  </TableCell>
                  {visible.map((key) => (
                    <TableCell key={key}>
                      {key === 'published_at' ? (
                        formatDateTime(row.published_at, zone)
                      ) : (
                        <Badge
                          variant='outline'
                          className={cn(
                            key === 'scope'
                              ? 'text-purple-600 dark:text-purple-400'
                              : 'text-blue-600 dark:text-blue-400'
                          )}
                        >
                          {tr(key === 'type' ? row.type : row.scope)}
                        </Badge>
                      )}
                    </TableCell>
                  ))}
                  {!sent && (
                    <TableCell>
                      <Badge variant={row.read_at ? 'secondary' : 'default'}>
                        {tr(row.read_at ? 'read' : 'unread')}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className='flex flex-wrap gap-2'>
                      <Button size='sm' variant='ghost' onClick={() => void m.openDetail(row)}>
                        {tr('view')}
                      </Button>
                      {!sent && !row.read_at && permissions.control(false, 'mark-read') && (
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={m.busy}
                          onClick={() => void m.mark(row)}
                        >
                          {tr('markRead')}
                        </Button>
                      )}
                      {deletable && (
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive'
                          onClick={() => m.remove(row)}
                        >
                          {tr(sent ? 'deleteGlobal' : 'delete')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!m.rows.length && (
                <TableRow>
                  <TableCell colSpan={visible.length + 4} className='py-10 text-center'>
                    {m.loading ? pick('Loading…', '加载中…') : tr('empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
        {readable && (
          <div className='mt-4 flex items-center justify-end gap-3'>
            <StyledSelect
              className='w-24'
              ariaLabel={pick('Page size', '每页数量')}
              value={String(m.size)}
              onChange={(v) => {
                m.setSize(Number(v));
                m.setPage(1);
              }}
              options={[10, 20, 50, 100].map((value) => ({
                value: String(value),
                label: String(value)
              }))}
            />
            <Button
              variant='outline'
              disabled={m.page === 1 || m.loading}
              onClick={() => m.setPage(m.page - 1)}
            >
              {pick('Previous', '上一页')}
            </Button>
            <span>
              {m.page} / {Math.max(1, Math.ceil(m.total / m.size))}
            </span>
            <Button
              variant='outline'
              disabled={m.page * m.size >= m.total || m.loading}
              onClick={() => m.setPage(m.page + 1)}
            >
              {pick('Next', '下一页')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      {embedded ? (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) closeHistory();
          }}
        >
          <DialogContent
            showCloseButton
            className='h-dvh w-screen max-w-none overflow-auto rounded-none sm:max-w-none'
          >
            <DialogHeader>
              <DialogTitle>{tr('history')}</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <PageContainer pageTitle={tr(sent ? 'manage' : 'inbox')}>{body}</PageContainer>
      )}
      <Dialog
        open={m.detail}
        onOpenChange={(v) => {
          if (!v) m.closeDetail();
        }}
      >
        <DialogContent className='max-h-[90vh] overflow-auto sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>{tr('detail')}</DialogTitle>
          </DialogHeader>
          {m.detailLoading ? (
            <p>{pick('Loading…', '加载中…')}</p>
          ) : (
            m.selected && (
              <>
                <h2 className='break-words text-xl'>{m.selected.title}</h2>
                <p>{formatDateTime(m.selected.published_at, zone)}</p>
                <p className='max-h-96 overflow-auto whitespace-pre-wrap break-words'>
                  {m.selected.content}
                </p>
                <p>
                  {tr('expiry')}:{' '}
                  {m.selected.expired_at
                    ? formatDateTime(m.selected.expired_at, zone)
                    : tr('noExpiry')}
                </p>
                {sent && m.selected.scope === 'targeted' && (
                  <section className='mt-5 rounded-lg border p-4'>
                    <h3>
                      {text('msg.recipients')} ·{' '}
                      {text('msg.recipientCount', { count: m.selected.recipients?.length ?? m.selected.recipient_ids?.length ?? 0 })}
                    </h3>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {m.selected.recipients?.length ? (
                        m.selected.recipients.map((recipient) => (
                          <span key={recipient.id} className='rounded border px-2 py-1 text-xs'>
                            {recipient.username} · {recipient.code}
                          </span>
                        ))
                      ) : (
                        <p>{text('msg.recipientsUnavailable')}</p>
                      )}
                    </div>
                  </section>
                )}
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!m.confirmation}
        onOpenChange={(v) => {
          if (!v && !m.busy) m.setConfirmation('');
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{tr('confirm')}</DialogTitle>
          </DialogHeader>
          <p>
            {tr(
              m.confirmation === 'readSelected'
                ? 'readSelectedConfirm'
                : m.confirmation === 'deleteSelected'
                  ? sent
                    ? 'deleteSelectedGlobalConfirm'
                    : 'deleteSelectedConfirm'
                  : sent
                    ? 'deleteGlobalConfirm'
                    : 'deleteConfirm'
            )}
          </p>
          {m.error && <p role='alert'>{m.error}</p>}
          <DialogFooter>
            <Button variant='outline' disabled={m.busy} onClick={() => m.setConfirmation('')}>
              {tr('cancel')}
            </Button>
            <Button
              disabled={m.busy}
              aria-busy={m.busy}
              onClick={async () => {
                if (await m.confirm()) setCheckedKeys([]);
              }}
            >
              {tr('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {m.compose && permissions.send && (
        <ComposeMessage
          close={() => m.setCompose(false)}
          saved={() => {
            m.setCompose(false);
            if (m.page !== 1) m.setPage(1);
            else void m.load();
          }}
        />
      )}
    </>
  );
}

export default function MessagePage(props: {
  sent?: boolean;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const text = useAdminText();
  const router = useRouter();
  const close = () => (props.onClose ? props.onClose() : router.replace('/dashboard/overview'));
  if (props.sent) return <LegacyMessagePage {...props} />;
  return (
    <AdminDrawer bare open title={text('msg.history')} onClose={close}>
      <InboxFeed onClose={close} />
    </AdminDrawer>
  );
}

"use client";
import { useState } from "react";
import MessagePage from "./message-page";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-context";
import { useLocale } from "@/features/i18n/locale-context";
import { formatDateTime } from "./date-time";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/icons";
import { useMessages, useUnreadCount } from "./use-messages";
import { useMsgLocale } from "./locale";
export default function MsgBell() {
  const tr = useMsgLocale(),
    count = useUnreadCount(),
    [open, setOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false);
  const auth = useAuth(),
    { timezone } = useLocale();
  const zone =
    timezone === "local"
      ? new Intl.DateTimeFormat().resolvedOptions().timeZone
      : timezone;
  const m = useMessages(false, open);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              className="relative"
              variant="ghost"
              size="icon"
              aria-label={tr("inbox")}
              aria-description={
                (count ?? 0) > 0
                  ? tr("count", { count: count ?? 0 })
                  : undefined
              }
              title={tr("inbox")}
            />
          }
        >
          <Icons.notification />
          {(count ?? 0) > 0 && (
            <span
              className="absolute end-2 top-2 size-2 rounded-full bg-primary"
              data-testid="message-unread-dot"
            />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-max min-w-[min(18rem,calc(100vw-1.5rem))] max-w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden p-0"
        >
          <section
            data-testid="notification-preview"
            aria-label={tr("notifications")}
          >
            <header className="flex items-center justify-between gap-4 px-4 py-3">
              <h2 className="text-sm font-medium">{tr("notifications")}</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={m.busy || m.loading || !m.total}
                aria-label={tr("readAll")}
                title={tr("readAll")}
                onClick={() => void m.readAll()}
              >
                <Icons.check />
              </Button>
            </header>
            {m.error && (
              <p role="alert" className="px-4 text-sm text-destructive">
                {m.error}
              </p>
            )}
            <ul className="max-h-90 overflow-y-auto">
              {m.rows.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t p-3 hover:bg-accent"
                >
                  <div data-testid="notification-avatar" className="self-start">
                    <Avatar size="lg">
                      <AvatarFallback>
                        {auth.user?.username.trim().slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <button
                    type="button"
                    aria-label={row.title}
                    disabled={m.busy || m.loading}
                    className="flex min-w-0 flex-col gap-1 text-start"
                    onClick={() => {
                      setOpen(false);
                      void m.openDetail(row);
                    }}
                  >
                    <span
                      data-testid="notification-title"
                      className="block w-full truncate text-sm font-semibold leading-5"
                    >
                      {row.title}
                    </span>
                    <span
                      data-testid="notification-content"
                      className="block w-full truncate text-xs leading-5 text-muted-foreground"
                    >
                      {row.content}
                    </span>
                    <time className="block w-full truncate text-xs leading-5 text-muted-foreground">
                      {formatDateTime(row.published_at, zone)}
                    </time>
                  </button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className={cn("size-6", row.read_at && "text-destructive")}
                    disabled={m.busy || m.loading}
                    aria-label={tr(row.read_at ? "delete" : "markRead")}
                    title={tr(row.read_at ? "delete" : "markRead")}
                    onClick={() =>
                      row.read_at ? m.remove(row) : void m.mark(row)
                    }
                  >
                    {row.read_at ? <Icons.circleX /> : <Icons.circleCheck />}
                  </Button>
                </li>
              ))}
            </ul>
            {!m.rows.length && (
              <p className="flex min-h-36 items-center justify-center px-4 text-sm text-muted-foreground">
                {tr(m.loading ? "loading" : "empty")}
              </p>
            )}
            <footer className="flex items-center justify-between gap-4 border-t px-4 py-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={m.busy || m.loading || !m.rows.length}
                onClick={m.clearPreview}
              >
                {tr("clear")}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setHistoryOpen(true);
                }}
              >
                {tr("viewAll")}
              </Button>
            </footer>
          </section>
        </PopoverContent>
      </Popover>
      <Dialog
        open={m.detail}
        onOpenChange={(v) => {
          if (!v) m.closeDetail();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{tr("detail")}</DialogTitle>
          </DialogHeader>
          {m.selected && (
            <>
              <h2>{m.selected.title}</h2>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(m.selected.published_at, zone)}
              </p>
              <p className="max-h-96 overflow-auto whitespace-pre-wrap break-words">
                {m.selected.content}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!m.confirmation}
        onOpenChange={(v) => {
          if (!v && !m.busy) m.setConfirmation("");
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{tr("confirm")}</DialogTitle>
          </DialogHeader>
          <p>
            {tr(
              m.confirmation === "clear"
                ? "clearPreviewConfirm"
                : "deleteConfirm",
              { count: m.clearCount },
            )}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={m.busy}
              onClick={() => m.setConfirmation("")}
            >
              {tr("cancel")}
            </Button>
            <Button
              disabled={m.busy}
              aria-busy={m.busy}
              onClick={() => void m.confirm()}
            >
              {tr("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {historyOpen && (
        <MessagePage embedded onClose={() => setHistoryOpen(false)} />
      )}
    </>
  );
}

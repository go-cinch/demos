import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Avatar from "@/components/ui/avatar/Avatar";
import { BellAltIcon, CheckCircleIcon, CloseLineIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import { useMessages, useUnreadCount } from "@/hooks/useMessages";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import MessagePage from "@/pages/System/MessagePage";
function date(value: number) {
  const d = new Date(value),
    pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export default function NotificationDropdown() {
  const { t } = useTranslation(),
    tr = (key: string) => t(`msg.${key}`),
    auth = useAuth();
  const [open, setOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    count = useUnreadCount(),
    m = useMessages(false, open, tr, (v) => new Date(v).valueOf());
  return (
    <div className="relative">
      <button
        aria-label={tr("inbox")}
        aria-description={
          (count ?? 0) > 0 ? t("msg.count", { count }) : undefined
        }
        className="relative flex size-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
        onClick={() => setOpen((v) => !v)}
        title={tr("inbox")}
      >
        <BellAltIcon className="size-5" />
        {(count ?? 0) > 0 && (
          <span
            className="absolute end-2 top-2 size-2 rounded-full bg-brand-500"
            data-testid="message-unread-dot"
          />
        )}
      </button>
      <Dropdown
        className="absolute end-0 mt-2 w-max min-w-[min(18rem,calc(100vw-1.5rem))] max-w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-gray-200 bg-white p-0 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        <section
          data-testid="notification-preview"
          role="region"
          aria-label={tr("notifications")}
        >
          <header className="flex items-center justify-between gap-4 px-4 py-3">
            <h2 className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {tr("notifications")}
            </h2>
            <button
              aria-label={tr("readAll")}
              title={tr("readAll")}
              className="flex size-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              disabled={m.busy || m.loading || !m.total}
              onClick={() => void m.readAll()}
            >
              <CheckCircleIcon className="size-4" />
            </button>
          </header>
          {m.error && (
            <p role="alert" className="px-4 text-sm text-error-500">
              {m.error}
            </p>
          )}
          <ul className="max-h-90 overflow-y-auto">
            {m.rows.map((row) => (
              <li
                className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t border-gray-200 p-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                key={row.id}
              >
                <div data-testid="notification-avatar" className="self-start">
                  <Avatar alt={auth.user?.username || ""} size="medium" />
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
                    className="block w-full truncate text-sm font-semibold leading-5 text-gray-800 dark:text-gray-100"
                  >
                    {row.title}
                  </span>
                  <span
                    data-testid="notification-content"
                    className="block w-full truncate text-xs leading-5 text-gray-500 dark:text-gray-400"
                  >
                    {row.content}
                  </span>
                  <time className="block w-full truncate text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {date(row.published_at)}
                  </time>
                </button>
                <button
                  type="button"
                  className={
                    row.read_at
                      ? "flex size-6 items-center justify-center rounded text-error-500"
                      : "flex size-6 items-center justify-center rounded text-gray-500 dark:text-gray-400"
                  }
                  aria-label={tr(row.read_at ? "delete" : "markRead")}
                  title={tr(row.read_at ? "delete" : "markRead")}
                  disabled={m.busy || m.loading}
                  onClick={() =>
                    row.read_at ? m.remove(row) : void m.mark(row)
                  }
                >
                  {row.read_at ? (
                    <CloseLineIcon className="size-4" />
                  ) : (
                    <CheckCircleIcon className="size-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!m.rows.length && (
            <p className="flex min-h-36 items-center justify-center px-4 text-sm text-gray-500">
              {m.loading ? t("common.loading") : tr("empty")}
            </p>
          )}
          <footer className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
            <button
              className="rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              disabled={m.busy || m.loading || !m.rows.length}
              onClick={m.clearPreview}
            >
              {tr("clear")}
            </button>
            <Button
              type="button"
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
      </Dropdown>
      <Modal
        ariaLabel={tr("detail")}
        isOpen={m.detail}
        onClose={m.closeDetail}
        showCloseButton={false}
        className="m-4 max-w-xl p-6"
      >
        <h2 className="mb-4 text-xl">{tr("detail")}</h2>
        {m.selected && (
          <>
            <h3>{m.selected.title}</h3>
            <p className="text-xs text-gray-500">
              {date(m.selected.published_at)}
            </p>
            <p className="my-4 max-h-96 overflow-auto whitespace-pre-wrap break-words">
              {m.selected.content}
            </p>
          </>
        )}
        <Button type="button" variant="outline" onClick={m.closeDetail}>
          {tr("cancel")}
        </Button>
      </Modal>
      <Modal
        ariaLabel={tr("confirm")}
        isOpen={!!m.confirmation}
        onClose={() => m.setConfirmation("")}
        showCloseButton={false}
        className="m-4 max-w-xl p-6"
      >
        <h2 className="mb-4 text-xl">{tr("confirm")}</h2>
        <p>
          {m.confirmation === "clear"
            ? t("msg.clearPreviewConfirm", { count: m.clearCount })
            : tr("deleteConfirm")}
        </p>
        {m.error && <p role="alert">{m.error}</p>}
        <div className="mt-4 flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={m.busy}
            onClick={() => m.setConfirmation("")}
          >
            {tr("cancel")}
          </Button>
          <Button
            type="button"
            disabled={m.busy}
            onClick={() => void m.confirm()}
          >
            {tr("confirm")}
          </Button>
        </div>
      </Modal>
      {historyOpen && (
        <MessagePage embedded onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}

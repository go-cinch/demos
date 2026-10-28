"use client";
import { useAuth } from "@/context/AuthContext";
import { messagePermissions } from "@/utils/message-permissions";
import MessageTypeIcon from "@/components/common/MessageTypeIcon";
import { useRef, useState } from "react";
import { useInboxFeed } from "./use-inbox-feed";
import {
  AButton,
  ACheck,
  AdminConfirm,
  useAdminIdentity,
  useAdminText,
  useAdminTimezone,
  mutedClass,
} from "@/pages/System/admin-ui";
import { adminDate } from "@/utils/admin/model";
export default function InboxFeed({ onClose }: { onClose?: () => void }) {
  const auth = useAuth();
  const text = useAdminText();
  return messagePermissions(auth).canRead ? <InboxFeedContent onClose={onClose} /> : <p>{text("msg.noPermission")}</p>;
}
function InboxFeedContent({ onClose }: { onClose?: () => void }) {
  const { canControl } = messagePermissions(useAuth());
  const viewport = useRef<HTMLDivElement>(null);
  const user = useAdminIdentity(),
    text = useAdminText(),
    zone = useAdminTimezone(),
    f = useInboxFeed(user?.id, viewport),
    [suggestOpen, setSuggestOpen] = useState(false),
    [confirmation, setConfirmation] = useState<
      { read: boolean; ids: number[]; bulk?: boolean } | undefined
    >();
  const all =
    f.rows.length > 0 && f.rows.every((row) => f.selected.includes(row.id));
  function submit(value = f.draft) {
    setSuggestOpen(false);
    f.search(value);
  }
  const options = [
    ...f.history
      .filter((value) =>
        value.toLocaleLowerCase().includes(f.draft.toLocaleLowerCase()),
      )
      .map((value) => ({ value, history: true })),
    ...f.suggestions
      .filter((value) => !f.history.includes(value))
      .map((value) => ({ value, history: false })),
  ];
  return (
    <section
      className="flex h-full min-h-0 flex-col px-6 pt-5 pb-4"
      data-testid="message-history"
      aria-label={text("msg.history")}
    >
      <header className="shrink-0 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={mutedClass}>{text("msg.feedCenter")}</p>
            <h2 className="mt-2 text-xl font-semibold">{text("msg.inbox")}</h2>
          </div>
          {onClose && <AButton onClick={onClose}>{text("msg.close")}</AButton>}
        </div>
        <div className="my-4 flex flex-wrap justify-between gap-3">
          <span className={mutedClass} data-testid="inbox-unread">
            {f.unread !== undefined
              ? text("msg.count", { count: f.unread })
              : "—"}
          </span>
          {canControl("read-all") && <AButton
            disabled={f.busy || f.loading || !f.unread}
            onClick={() => void f.readAll()}
          >
            {text("msg.readAll")}
          </AButton>}
        </div>
        {canControl("query") && <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="relative"
        >
          <input
            aria-label={text("msg.searchMessages")}
            placeholder={text("msg.searchMessages")}
            className="w-full rounded-lg border bg-transparent p-3 text-sm"
            value={f.draft}
            onChange={(event) => {
              f.setDraft(event.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => {
              setSuggestOpen(true);
              f.cancelSearch();
            }}
            onBlur={() => {
              setSuggestOpen(false);
              f.scheduleSearch();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setSuggestOpen(false);
              }
            }}
          />
          {suggestOpen && (options.length > 0 || f.suggesting) && (
            <div
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white p-2 shadow-lg dark:bg-gray-900"
              role="listbox"
            >
              {f.suggesting && (
                <div
                  aria-busy="true"
                  className="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
                />
              )}
              {options.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  key={option.value}
                  className="block w-full rounded p-2 text-start text-sm break-words hover:bg-gray-100 dark:bg-gray-800/50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    f.setDraft(option.value);
                    submit(option.value);
                  }}
                >
                  <Highlight value={option.value} query={f.draft} />
                  {option.history && (
                    <span className="ms-2 text-xs opacity-60">
                      {text("msg.searchHistory")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </form>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={text("msg.feedFilters")}
            className="flex flex-1 flex-wrap gap-2"
          >
            {["all", "unread", "read", "notice", "system"].map((value) => (
              <button
                type="button"
                key={value}
                disabled={f.busy}
                aria-pressed={f.filter === value}
                className="border-b-2 border-transparent px-1 py-2 text-sm opacity-70 aria-pressed:border-brand-500 aria-pressed:text-brand-500 aria-pressed:opacity-100"
                onClick={() => f.setFilter(value)}
              >
                {text(`msg.${value === "all" ? "feedAll" : value}`)}
              </button>
            ))}
          </div>
          {canControl("refresh") && <AButton
            disabled={f.busy || f.loading}
            onClick={() => void f.refresh()}
          >
            {text("msg.refresh")}
          </AButton>}
          <AButton
            disabled={f.busy || f.loading}
            active={f.selecting}
            onClick={() => {
              f.setSelecting(!f.selecting);
              f.setSelected([]);
            }}
          >
            {text(f.selecting ? "msg.cancel" : "msg.select")}
          </AButton>
        </div>
        {f.selecting && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
            <ACheck
              label={text("msg.feedSelectLoaded")}
              checked={all}
              disabled={f.busy || f.loading || !f.rows.length}
              onChange={(checked) =>
                f.setSelected(checked ? f.rows.map((row) => row.id) : [])
              }
            />
            <span className={mutedClass}>{text("msg.feedSelectLoaded")}</span>
            {f.selected.length > 0 && (
              <>
                {canControl("mark-selected-read") && <AButton
                  testId="message-bulk-read"
                  disabled={f.busy || f.loading}
                  onClick={() =>
                    setConfirmation({ read: true, ids: f.selected, bulk: true })
                  }
                >
                  {text("msg.markRead")}
                </AButton>}
                {canControl("delete-selected") && <AButton
                  testId="message-bulk-delete"
                  danger
                  disabled={f.busy || f.loading}
                  onClick={() =>
                    setConfirmation({ read: false, ids: f.selected, bulk: true })
                  }
                >
                  {text("msg.deleteSelected")}
                </AButton>}
              </>
            )}
          </div>
        )}
      </header>
      <div
        ref={viewport}
        data-testid="inbox-scroll"
        className="min-h-0 flex-1 overflow-auto pb-4"
        style={{ overflowAnchor: "none", overscrollBehavior: "contain" }}
        aria-busy={f.loading || f.loadingMore}
        onScroll={() => {
          const node = viewport.current;
          if (
            node &&
            !f.moreError &&
            node.scrollHeight - node.scrollTop - node.clientHeight < 100
          )
            void f.more();
        }}
      >
        {f.updates && (
          <div className="mt-4">
            <AButton
              disabled={f.busy || f.loading}
              onClick={() => void f.refresh()}
            >
              {text("msg.feedUpdates")}
            </AButton>
          </div>
        )}
        {f.error && (
          <div
            role="alert"
            className="my-4 rounded border border-red-500/30 p-3"
          >
            {text("msg.error")}
            <AButton onClick={() => void f.refresh()}>
              {text("msg.retry")}
            </AButton>
          </div>
        )}
        {f.loading && !f.rows.length ? (
          <div className="space-y-8 py-6">
            {[1, 2, 3, 4].map((id) => (
              <div
                key={id}
                className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : !f.rows.length && !f.error ? (
          <p className={`${mutedClass} py-16 text-center`}>
            {text(
              f.query
                ? "msg.feedNoMatch"
                : f.filter === "unread"
                  ? "msg.feedNoUnread"
                  : "msg.empty",
            )}
          </p>
        ) : (
          f.rows.map((row, index) => (
            <div key={row.id}>
              {(!index ||
                adminDate(f.rows[index - 1].published_at, zone).slice(0, 10) !==
                  adminDate(row.published_at, zone).slice(0, 10)) && (
                <p className={`${mutedClass} pt-5 text-xs`}>
                  {adminDate(row.published_at, zone).slice(0, 10)}
                </p>
              )}
              <article
                data-testid="inbox-message"
                aria-label={row.title}
                className="flex items-start gap-3 border-b py-5"
              >
                {f.selecting ? (
                  <ACheck
                    label={`${text("msg.select")} ${row.title}`}
                    checked={f.selected.includes(row.id)}
                    disabled={f.busy || f.loading}
                    onChange={(checked) =>
                      f.setSelected((old) =>
                        checked
                          ? [...new Set([...old, row.id])]
                          : old.filter((id) => id !== row.id),
                      )
                    }
                  />
                ) : (
                  <MessageTypeIcon
                    type={row.type}
                    label={text(`msg.${row.type}`)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={`${mutedClass} flex flex-wrap items-center gap-2 text-xs`}
                  >
                    <span>{text(`msg.${row.type}`)}</span>
                    <time>{adminDate(row.published_at, zone)}</time>
                    <span
                      className={
                        !row.read_at ? "ms-auto text-brand-500" : "ms-auto"
                      }
                    >
                      {!row.read_at && <span aria-hidden="true">• </span>}
                      <span>
                        {text(row.read_at ? "msg.read" : "msg.unread")}
                      </span>
                    </span>
                  </div>
                  <h3 className="my-2 text-base font-semibold break-words">
                    {row.title}
                  </h3>
                  <p
                    id={`inbox-content-${row.id}`}
                    className={
                      f.expanded.includes(row.id)
                        ? "text-sm leading-7 break-words whitespace-pre-wrap"
                        : "line-clamp-2 text-sm leading-7 break-words whitespace-pre-wrap opacity-70"
                    }
                  >
                    {f.expanded.includes(row.id) ? row.content : row.summary}
                  </p>
                  {f.detailError === row.id && (
                    <div role="alert">
                      {text("msg.detailError")}
                      <AButton onClick={() => void f.toggle(row)}>
                        {text("msg.retry")}
                      </AButton>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canControl("view-detail") && <button
                      type="button"
                      aria-expanded={f.expanded.includes(row.id)}
                      aria-controls={`inbox-content-${row.id}`}
                      className="text-sm text-brand-500"
                      disabled={f.busy || f.loading}
                      onClick={() => void f.toggle(row)}
                    >
                      {text(
                        f.expanded.includes(row.id)
                          ? "msg.feedCollapse"
                          : "msg.feedExpand",
                      )}
                    </button>}
                    {!row.read_at && canControl("mark-read") && (
                      <AButton
                        disabled={f.busy || f.loading}
                        onClick={() => void f.mark(row.id)}
                      >
                        {text("msg.markRead")}
                      </AButton>
                    )}
                    {canControl("delete") && <div className="ms-auto">
                      <AButton
                        disabled={f.busy || f.loading}
                        onClick={() =>
                          setConfirmation({ read: false, ids: [row.id] })
                        }
                      >
                        {text("msg.delete")}
                      </AButton>
                    </div>}
                  </div>
                </div>
              </article>
            </div>
          ))
        )}
        {f.rows.length > 0 && (
          <div className={`${mutedClass} py-5 text-center`} aria-live="polite">
            {f.loadingMore ? (
              text("msg.feedLoadingMore")
            ) : f.moreError ? (
              <>
                <span>{text("msg.error")}</span>
                <AButton onClick={() => void f.more()}>
                  {text("msg.retry")}
                </AButton>
              </>
            ) : f.hasMore ? (
              <AButton
                disabled={f.busy || f.loading}
                onClick={() => void f.more()}
              >
                {text("msg.feedLoadMore")}
              </AButton>
            ) : (
              text("msg.feedEnd")
            )}
          </div>
        )}
      </div>
      <footer
        className={`${mutedClass} flex shrink-0 flex-wrap justify-between gap-2 border-t pt-4 text-xs`}
      >
        <span>
          {text("msg.feedShown", { count: f.rows.length, total: f.total })}
        </span>
        <span>{text("msg.feedOrder")}</span>
      </footer>
      <AdminConfirm
        open={!!confirmation}
        title={text(
          confirmation?.read
            ? "msg.readSelectedConfirm"
            : (confirmation?.ids.length ?? 0) > 1
              ? "msg.deleteSelectedConfirm"
              : "msg.deleteConfirm",
        )}
        busy={f.busy}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => {
          if (confirmation)
            void f
              .bulk(confirmation.read, confirmation.ids, confirmation.bulk)
              .then(() => setConfirmation(undefined));
        }}
      />
    </section>
  );
}
function Highlight({ value, query }: { value: string; query: string }) {
  const needle = query.trim(),
    index = value.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  return index < 0 || !needle ? (
    value
  ) : (
    <>
      {value.slice(0, index)}
      <mark className="bg-transparent font-semibold text-brand-500">
        {value.slice(index, index + needle.length)}
      </mark>
      {value.slice(index + needle.length)}
    </>
  );
}

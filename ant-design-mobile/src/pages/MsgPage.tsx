import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, Tag, Checkbox } from "antd-mobile";
import { session } from "../lib/api";
import { useMessages } from "../lib/use-messages";
import { dateTime, parseDateTime } from "../lib/format";
import { t } from "../locales";
import {
  Icon,
  Sheet,
  Field,
  TextField,
  ErrorBox,
  NoData,
} from "../components/UI";
import RemoteSelect from "../components/RemoteSelect";
import DateTimeField from "../components/DateTimeField";
import PageSkeleton from "../components/PageSkeleton";
import ResultToolbar from "../components/ResultToolbar";
import RecordPagination from "../components/RecordPagination";
import ResultOptions from "../components/ResultOptions";
const tr = (key: string) => t(`app.msg.${key}`);
export default function MsgPage() {
  const composeForm = useRef<HTMLFormElement>(null);
  const sent = useLocation().pathname === "/system/msg";
  const permitted = (action: string) =>
    session.user?.permission.btns.some(
      (code) => code === "*" || code === `system.msg.${action}`,
    ) ?? false;
  const readable = !sent || permitted("read"),
    deletable = !sent || permitted("delete");
  const m = useMessages(sent, readable, tr, (value) =>
    parseDateTime(value).valueOf(),
  );
  const [selecting, setSelecting] = useState(false);
  const [checkedIDs, setCheckedIDs] = useState<number[]>([]);
  const checkedVisible = checkedIDs.filter((id) =>
    m.rows.some((row) => row.id === id),
  );
  useEffect(() => {
    setCheckedIDs([]);
  }, [sent, m.page, m.size, m.type, m.status]);
  const [options, setOptions] = useState(""),
    [density, setDensity] = useState("default"),
    [columns, setColumns] = useState([
      "title",
      "type",
      "scope",
      "published_at",
    ]);
  const [bordered, setBordered] = useState(false),
    [striped, setStriped] = useState(false),
    [sticky, setSticky] = useState(true);
  async function send() {
    await m.send();
    if (Object.values(m.issues).some(Boolean))
      requestAnimationFrame(() => {
        const field = composeForm.current?.querySelector<HTMLElement>(
          ".field.invalid input,.field.invalid textarea,.field.invalid button",
        );
        field?.scrollIntoView({ block: "center" });
        field?.focus();
      });
  }
  const fields = ["title", "type", "scope", "published_at"].map((key) => ({
    key,
    title: tr(key === "published_at" ? "published" : key),
  }));
  return (
    <section
      className={`page management density-${density} ${bordered ? "bordered" : ""} ${striped ? "striped" : ""} ${sticky ? "sticky-toolbar" : ""}`}
      data-testid="message-management-page"
      aria-busy={m.loading}
    >
      <header className="page-heading">
        <Link
          to={sent ? "/dashboard/overview?tab=manage" : "/dashboard/overview"}
          className="back-link"
          aria-label={t(sent ? "manage" : "home")}
        >
          <Icon name="chevron-left" />
        </Link>
        <div>
          <h1>{tr(sent ? "manage" : "inbox")}</h1>
        </div>
      </header>
      <section className="search-region">
        <Field name="msg-filter-type" label={tr("type")}>
          <RemoteSelect
            name="msg-filter-type"
            label={tr("type")}
            value={m.type}
            onChange={(v) => m.setType(String(v ?? ""))}
            options={["", "system", "notice"].map((value) => ({
              value,
              label: tr(value || "allTypes"),
            }))}
          />
        </Field>
        {!sent && (
          <div className="segmented" role="group" aria-label={tr("read")}>
            {["", "unread", "read"].map((value) => (
              <button
                key={value}
                aria-pressed={m.status === value}
                className={m.status === value ? "active" : ""}
                onClick={() => m.setStatus(value)}
              >
                {tr(value || "allStatus")}
              </button>
            ))}
          </div>
        )}
        <div className="search-actions message-search-actions">
          <button
            className="search-reset"
            onClick={() => {
              m.setType("");
              m.setStatus("");
            }}
          >
            <Icon name="refresh" size={14} />
            <span>{t("system.common.reset")}</span>
          </button>
          <button className="search-submit" onClick={() => void m.load()}>
            <Icon name="search" size={14} />
            <span>{t("system.common.search")}</span>
          </button>
        </div>
      </section>
      <div className="results-region">
        <ResultToolbar
          disabled={!readable}
          refresh={() => void m.load()}
          options={setOptions}
        >
          {sent && permitted("send") && (
            <Button
              className="create-record"
              size="small"
              color="primary"
              onClick={m.newMessage}
            >
              <Icon name="add" size={16} />
              <span className="create-label">{tr("send")}</span>
            </Button>
          )}
          {!sent && (
            <Button
              size="small"
              disabled={m.loading || m.busy}
              onClick={() => void m.readAll()}
            >
              {tr("readAll")}
            </Button>
          )}{" "}
        </ResultToolbar>
        <div className="selection-tools">
          <div className="selection-actions">
            {readable && m.rows.length > 0 && (deletable || !sent) && (
              <button
                className="action-chip action-chip-quiet"
                disabled={m.busy || m.loading}
                onClick={() => {
                  setSelecting((v) => !v);
                  setCheckedIDs([]);
                }}
              >
                <Icon
                  name={selecting ? "check" : "check-rectangle"}
                  size={16}
                />
                <span>{t(selecting ? "done" : "select")}</span>
              </button>
            )}
            {selecting && (
              <button
                className="action-chip action-chip-quiet"
                disabled={m.busy || m.loading}
                onClick={() =>
                  setCheckedIDs(
                    checkedVisible.length === m.rows.length
                      ? []
                      : m.rows.map((row) => row.id),
                  )
                }
              >
                <Icon name="check-double" size={16} />
                <span>{t("system.common.selectAll")}</span>
              </button>
            )}

            {checkedVisible.length > 0 && deletable && (
              <button
                data-testid="message-bulk-delete"
                className="action-chip action-chip-danger"
                disabled={m.busy || m.loading}
                onClick={() => m.requestBulk(checkedVisible, "deleteSelected")}
              >
                <Icon name="delete" size={16} />
                <span>{tr("deleteSelected")}</span>
              </button>
            )}
            {checkedVisible.length > 0 && !sent && (
              <button
                data-testid="message-bulk-read"
                className="action-chip action-chip-quiet"
                disabled={m.busy || m.loading}
                onClick={() => m.requestBulk(checkedVisible, "readSelected")}
              >
                <Icon name="check" size={16} />
                <span>{tr("markRead")}</span>
              </button>
            )}
          </div>
          <span className="result-count">
            {t("system.table.total", { count: m.total })}
          </span>
        </div>
        {!readable ? (
          <NoData text={tr("noPermission")} />
        ) : (
          <>
            <ErrorBox error={m.error} retry={() => void m.load()} />
            {m.loading ? (
              <PageSkeleton variant="list" />
            ) : (
              <div className="card record-list">
                {m.rows.map((row) => (
                  <article
                    className="record-item"
                    key={row.id}
                    data-record-id={row.id}
                  >
                    <div className="record">
                      {selecting && (
                        <Checkbox
                          aria-label={`${t("select")} ${row.title}`}
                          disabled={m.busy || m.loading}
                          checked={checkedVisible.includes(row.id)}
                          onChange={(checked) =>
                            setCheckedIDs((ids) =>
                              checked
                                ? [...ids, row.id]
                                : ids.filter((id) => id !== row.id),
                            )
                          }
                        />
                      )}
                      <button
                        className="record-open"
                        aria-label={`${tr("view")} ${row.title}`}
                        onClick={() => void m.openDetail(row)}
                      >
                        <span className="record-kind">
                          <Icon name="notification" />
                        </span>
                        <span className="record-main">
                          <strong>{row.title}</strong>
                          <span className="record-summary">
                            {columns.includes("type") && (
                              <Tag color="primary" fill="outline">
                                {tr(row.type)}
                              </Tag>
                            )}
                            {columns.includes("scope") && (
                              <Tag fill="outline">{tr(row.scope)}</Tag>
                            )}
                            {row.expired_at && row.expired_at <= Date.now() && (
                              <Tag>{tr("expired")}</Tag>
                            )}
                          </span>
                        </span>
                        {!sent && (
                          <Tag color={row.read_at ? "default" : "primary"}>
                            {tr(row.read_at ? "read" : "unread")}
                          </Tag>
                        )}
                        <Icon name="chevron-right" size={16} />
                      </button>
                    </div>
                    {columns.includes("published_at") && (
                      <dl className="record-fields">
                        <div>
                          <dt>{tr("published")}</dt>
                          <dd>{dateTime(row.published_at)}</dd>
                        </div>
                      </dl>
                    )}
                    {!sent && !row.read_at && (
                      <div className="selection-actions">
                        <button
                          className="action-chip action-chip-quiet"
                          disabled={m.busy}
                          onClick={() => void m.mark(row)}
                        >
                          {tr("markRead")}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {!m.rows.length && <NoData text={tr("empty")} />}
              </div>
            )}
            <RecordPagination
              page={m.page}
              size={m.size}
              total={m.total}
              loading={m.loading}
              change={m.setPage}
              options={() => setOptions("pageSize")}
            />
          </>
        )}
      </div>
      <ResultOptions
        options={options}
        setOptions={setOptions}
        density={density}
        setDensity={setDensity}
        size={m.size}
        setSize={m.setSize}
        setPage={m.setPage}
        columns={columns}
        setColumns={setColumns}
        fields={fields}
        identity="title"
        bordered={bordered}
        setBordered={setBordered}
        striped={striped}
        setStriped={setStriped}
        sticky={sticky}
        setSticky={setSticky}
      />
      <Sheet
        open={m.detail}
        onClose={m.closeDetail}
        title={tr("detail")}
        footer={
          m.selected && deletable ? (
            <Button
              color="danger"
              fill="outline"
              onClick={() => m.remove(m.selected!)}
            >
              {tr(sent ? "deleteGlobal" : "delete")}
            </Button>
          ) : undefined
        }
      >
        {m.detailLoading ? (
          <PageSkeleton />
        ) : (
          m.selected && (
            <>
              <div className="detail-identity">
                <span className="avatar large">
                  <Icon name="notification" />
                </span>
                <h2>{m.selected.title}</h2>
              </div>
              <dl className="details">
                {[
                  ["type", tr(m.selected.type)],
                  ["scope", tr(m.selected.scope)],
                  ["published", dateTime(m.selected.published_at)],
                  ["content", m.selected.content],
                  [
                    "expiry",
                    m.selected.expired_at
                      ? dateTime(m.selected.expired_at)
                      : tr("noExpiry"),
                  ],
                  ...(sent && m.selected.recipient_ids
                    ? [["recipientIDs", m.selected.recipient_ids.join(", ")]]
                    : []),
                ].map(([key, value]) => (
                  <div
                    key={key}
                    className={key === "content" ? "detail-wide" : ""}
                  >
                    <dt>{tr(key)}</dt>
                    <dd className="msg-content">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )
        )}
      </Sheet>
      <Sheet
        open={!!m.confirmation}
        onClose={() => m.setConfirmation("")}
        busy={m.busy}
        title={tr("confirm")}
        footer={
          <div className="sheet-actions">
            <Button disabled={m.busy} onClick={() => m.setConfirmation("")}>
              {tr("cancel")}
            </Button>
            <Button
              loading={m.busy}
              color={
                m.confirmation === "delete" ||
                m.confirmation === "deleteSelected"
                  ? "danger"
                  : "primary"
              }
              onClick={async () => {
                if (await m.confirm()) setCheckedIDs([]);
              }}
            >
              {tr("confirm")}
            </Button>
          </div>
        }
      >
        <p>
          {tr(
            m.confirmation === "readSelected"
              ? "readSelectedConfirm"
              : m.confirmation === "deleteSelected"
                ? sent
                  ? "deleteSelectedGlobalConfirm"
                  : "deleteSelectedConfirm"
                : sent
                  ? "deleteGlobalConfirm"
                  : "deleteConfirm",
          )}
        </p>
        <ErrorBox error={m.error} />
      </Sheet>
      <Sheet
        open={m.compose}
        onClose={() => m.setCompose(false)}
        dirty={m.dirty}
        busy={m.busy}
        title={tr("send")}
        footer={(close) => (
          <div className="sheet-actions">
            <Button disabled={m.busy} onClick={close}>
              {tr("cancel")}
            </Button>
            <Button
              color="primary"
              loading={m.busy}
              onClick={() => void send()}
            >
              {tr("send")}
            </Button>
          </div>
        )}
      >
        <form
          ref={composeForm}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <fieldset disabled={m.busy}>
            <TextField
              name="msg-title"
              label={tr("title")}
              required
              value={m.draft.title}
              onChange={(title) => m.setDraft((d) => ({ ...d, title }))}
              error={m.attempted ? m.issues.title : ""}
            />
            <TextField
              name="msg-content"
              label={tr("content")}
              required
              multiline
              value={m.draft.content}
              onChange={(content) => m.setDraft((d) => ({ ...d, content }))}
              error={m.attempted ? m.issues.content : ""}
            />
            <Field name="msg-type" label={tr("type")}>
              <RemoteSelect
                name="msg-type"
                label={tr("type")}
                value={m.draft.type}
                onChange={(value) =>
                  m.setDraft((d) => ({
                    ...d,
                    type: value as "notice" | "system",
                  }))
                }
                options={["system", "notice"].map((value) => ({
                  value,
                  label: tr(value),
                }))}
              />
            </Field>
            <Field name="msg-scope" label={tr("scope")}>
              <RemoteSelect
                name="msg-scope"
                label={tr("scope")}
                value={m.draft.scope}
                onChange={(value) =>
                  m.setDraft((d) => ({
                    ...d,
                    scope: value as "all" | "targeted",
                  }))
                }
                options={["all", "targeted"].map((value) => ({
                  value,
                  label: tr(value),
                }))}
              />
            </Field>
            {m.draft.scope === "targeted" && (
              <Field
                name="msg-recipients"
                label={tr("recipients")}
                required
                error={m.attempted ? m.issues.recipients : ""}
              >
                <RemoteSelect
                  name="msg-recipients"
                  label={tr("recipients")}
                  value={m.draft.recipient_ids}
                  onChange={(value) =>
                    m.setDraft((d) => ({
                      ...d,
                      recipient_ids: value as number[],
                    }))
                  }
                  msgRecipients
                  multiple
                />
              </Field>
            )}
            <Field
              name="msg-expiry"
              label={tr("expiry")}
              error={m.attempted ? m.issues.expiry : ""}
            >
              <DateTimeField
                id="msg-expiry"
                name="msg-expiry"
                value={m.expiry}
                onChange={m.setExpiry}
              />
            </Field>
            <ErrorBox error={m.sendError} />
          </fieldset>
        </form>
      </Sheet>
    </section>
  );
}

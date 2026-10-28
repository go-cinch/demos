import { messageListFields } from "@/utils/admin/list-fields";
import { messagePermissions } from "@/utils/message-permissions";
import { useAdminNow } from "@/utils/admin/clock";
import AssociationEditor from "./association-editor";
import { adminDate, parseAdminDateTime } from "@/utils/admin/model";
import { readAdminTimezone } from "@/utils/admin/timezone";
import SentSummary from "@/pages/Messages/sent-summary";
import SentWorkspace from "@/pages/Messages/sent-workspace";
import MessageSearch from "@/pages/Messages/message-search";
import InboxFeed from "@/pages/Messages/inbox-feed";
import {
  AdminDrawer,
  AButton,
  ASelect,
  useAdminText,
  useAdminTimezone,
} from "./admin-ui";
import { createPortal } from "react-dom";
import Checkbox from "@/components/form/input/Checkbox";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useMessages } from "@/hooks/useMessages";
import PageMeta from "@/components/common/PageMeta";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Badge from "@/components/ui/badge/Badge";
import SimpleSelect from "./SimpleSelect";
import ResultToolbar, {
  type Density,
  type TableSettings,
} from "./ResultToolbar";
const surface =
  "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";
function date(value: number) {
  return adminDate(value, readAdminTimezone());
}
function LegacyMessagePage({
  sent = false,
  embedded = false,
  onClose,
}: {
  sent?: boolean;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const now = useAdminNow();
  const { t } = useTranslation(),
    auth = useAuth(),
    navigate = useNavigate(),
    tr = (key: string) => t(`msg.${key}`);
  const closeHistory = () =>
    onClose ? onClose() : navigate("/dashboard/overview");
  const { canRead: readable, canControl, canSend, canDelete: deletable } = messagePermissions(auth, sent);
  const timezone = useAdminTimezone();
  const [sentView, setSentView] = useState("split");
  const [visible, setVisible] = useState(["type", "scope", "published_at"]);
  const m = useMessages(sent, readable, tr, (v) =>
    parseAdminDateTime(v, timezone), messageListFields(sent, visible, sentView),
  );
  const text = useAdminText();
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const checkedVisible = checkedKeys.filter((id) =>
    m.rows.some((row) => row.id === id),
  );
  const allChecked =
    m.rows.length > 0 && checkedVisible.length === m.rows.length;
  const partial = checkedVisible.length > 0 && !allChecked;
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- reset row selection when the result-page context changes
    setCheckedKeys([]);
  }, [sent, m.page, m.size, m.type, m.status]);
  const [density, setDensity] = useState<Density>("default"),
    [settings, setSettings] = useState<TableSettings>({
      bordered: true,
      striped: true,
      sticky: true,
    }),
    [fullscreen, setFullscreen] = useState(false),
    [discard, setDiscard] = useState(false);
  const columns = ["type", "scope", "published_at"].map((key) => ({
    key,
    label: `msg.${key === "published_at" ? "published" : key}`,
  }));
  function closeCompose() {
    if (m.busy) return;
    if (m.dirty) setDiscard(true);
    else m.setCompose(false);
  }
  const body = (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[10000] overflow-auto bg-gray-50 p-6 dark:bg-gray-950"
          : ""
      }
    >
      <div className="space-y-5">
        {sent && <SentSummary allowed={readable} revision={summaryRevision} />}
        <div className={surface}>
          <form
            noValidate
            className="flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canControl("query")) void m.load();
            }}
          >
            {sent && (
              <>
                {canControl("query") && <MessageSearch value={m.query} onSearch={m.setQuery} />}
                <label className="space-y-2">
                  <span className="text-sm">{text("msg.scope")}</span>
                  <ASelect
                    label={text("msg.scope")}
                    value={m.scope}
                    onChange={m.setScope}
                    options={["", "all", "targeted"].map((value) => ({
                      value,
                      label: text(`msg.${value || "allScopes"}`),
                    }))}
                  />
                </label>
              </>
            )}
            {!sent && (
              <div className="w-56">
                <Label>{tr("read")}</Label>
                <SimpleSelect
                  ariaLabel={tr("read")}
                  value={m.status}
                  onChange={(v) => m.setStatus(String(v))}
                  options={["", "unread", "read"].map((value) => ({
                    value,
                    label: tr(value || "allStatus"),
                  }))}
                />
              </div>
            )}
            <div className="w-56">
              <Label>{tr("type")}</Label>
              <SimpleSelect
                ariaLabel={tr("type")}
                value={m.type}
                onChange={(v) => m.setType(String(v))}
                options={["", "system", "notice"].map((value) => ({
                  value,
                  label: tr(value || "allTypes"),
                }))}
              />
            </div>
            {canControl("reset-query") && <Button
              type="button"
              variant="outline"
              onClick={() => {
                m.setType("");
                m.setQuery("");
                m.setScope("");
                m.setStatus("");
              }}
            >
              {t("common.reset")}
            </Button>}
            {canControl("query") && <Button type="button" onClick={() => void m.load()}>
              {t("common.search")}
            </Button>}
          </form>
        </div>
        <div className={surface}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {canSend && (
                <Button type="button" size="sm" onClick={m.newMessage}>
                  {tr("send")}
                </Button>
              )}
              {!sent && canControl("read-all") && (
                <Button
                  type="button"
                  size="sm"
                  disabled={m.busy || m.loading}
                  onClick={() => void m.readAll()}
                >
                  {tr("readAll")}
                </Button>
              )}
              {readable && checkedVisible.length > 0 && (
                <>
                  {canControl("delete-selected") && (
                    <Button
                      data-testid="message-bulk-delete"
                      variant="danger"
                      size="sm"
                      disabled={m.busy || m.loading}
                      onClick={() =>
                        m.requestBulk(checkedVisible, "deleteSelected")
                      }
                    >
                      {tr("deleteSelected")}
                    </Button>
                  )}
                  {!sent && canControl("mark-selected-read") && (
                    <Button
                      data-testid="message-bulk-read"
                      variant="outline"
                      size="sm"
                      disabled={m.busy || m.loading}
                      onClick={() =>
                        m.requestBulk(checkedVisible, "readSelected")
                      }
                    >
                      {tr("markRead")}
                    </Button>
                  )}
                </>
              )}
            </div>
            <div className="ms-auto flex gap-2">
              {["split", "table"].map((view) => (
                <AButton
                  key={view}
                  active={sentView === view}
                  onClick={() => setSentView(view)}
                >
                  {text(view === "split" ? "msg.splitView" : "msg.tableView")}
                </AButton>
              ))}
            </div>
            <ResultToolbar
              canRefresh={canControl("refresh")}
              refresh={() => {
                setSummaryRevision((value) => value + 1);
                void m.load();
              }}
              density={density}
              setDensity={setDensity}
              fullscreen={embedded || fullscreen}
              toggleFullscreen={() =>
                embedded ? closeHistory() : setFullscreen((v) => !v)
              }
              columns={columns}
              visible={visible}
              setVisible={setVisible}
              settings={settings}
              setSettings={setSettings}
            />
          </div>

          {!readable ? (
            <p>{tr("noPermission")}</p>
          ) : m.error ? (
            <div role="alert">
              {m.error}
              <Button type="button" onClick={() => void m.load()}>
                {tr("retry")}
              </Button>
            </div>
          ) : sentView === "split" ? (
            <SentWorkspace
              rows={m.rows}
              loading={m.loading}
              checked={checkedVisible}
              onCheck={setCheckedKeys}
              canView={canControl("view-detail")}
              onView={(row) => void m.openDetail(row)}
              onDelete={deletable ? m.remove : undefined}
              visible={visible}
              density={density}
            />
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-start text-sm"
                aria-busy={m.loading}
              >
                <thead
                  className={
                    settings.sticky
                      ? "sticky top-0 bg-gray-50 dark:bg-gray-800"
                      : ""
                  }
                >
                  <tr>
                    <th className="px-4 py-3">
                      <Checkbox
                        ariaLabel={tr("selectAll")}
                        checked={allChecked}
                        indeterminate={partial}
                        disabled={m.loading || !m.rows.length}
                        onChange={(value) =>
                          setCheckedKeys(
                            value ? m.rows.map((row) => row.id) : [],
                          )
                        }
                      />
                    </th>
                    {[
                      "title",
                      ...visible,
                      ...(!sent ? ["read_at"] : []),
                      "actions",
                    ].map((key) => (
                      <th key={key} className="px-4 py-3 text-start">
                        {key === "read_at"
                          ? tr("read")
                          : key === "published_at"
                            ? tr("published")
                            : tr(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`${settings.striped && index % 2 ? "bg-gray-50 dark:bg-gray-800" : ""} ${settings.bordered ? "border-b border-gray-200 dark:border-gray-700" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          ariaLabel={`${tr("select")} ${row.title}`}
                          checked={checkedVisible.includes(row.id)}
                          disabled={m.loading}
                          onChange={(value) =>
                            setCheckedKeys((all) =>
                              value
                                ? [...all, row.id]
                                : all.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      <td
                        className={`max-w-80 px-4 break-words ${density === "compact" ? "py-2" : density === "loose" ? "py-6" : "py-3"}`}
                      >
                        <button
                          className="text-start text-brand-500"
                          disabled={!canControl("view-detail")}
                          onClick={() => void m.openDetail(row)}
                        >
                          {row.title}
                        </button>
                        {row.expired_at && row.expired_at <= now && (
                          <Badge>{tr("expired")}</Badge>
                        )}
                      </td>
                      {visible.map((key) => (
                        <td key={key} className="px-4 py-3">
                          {key === "published_at" ? (
                            date(row.published_at)
                          ) : (
                            <Badge color={key === "type" ? "primary" : "info"}>
                              {tr(key === "type" ? row.type : row.scope)}
                            </Badge>
                          )}
                        </td>
                      ))}
                      {!sent && (
                        <td className="px-4 py-3">
                          <Badge color={row.read_at ? "light" : "primary"}>
                            {tr(row.read_at ? "read" : "unread")}
                          </Badge>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3">
                          <button
                            className="text-brand-500"
                            disabled={!canControl("view-detail")}
                            onClick={() => void m.openDetail(row)}
                          >
                            {tr("view")}
                          </button>
                          {!sent && !row.read_at && canControl("mark-read") && (
                            <button
                              className="text-brand-500"
                              disabled={m.busy}
                              onClick={() => void m.mark(row)}
                            >
                              {tr("markRead")}
                            </button>
                          )}
                          {deletable && (
                            <button
                              className="text-error-500"
                              onClick={() => m.remove(row)}
                            >
                              {tr(sent ? "deleteGlobal" : "delete")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!m.rows.length && (
                    <tr>
                      <td
                        className="p-8 text-center"
                        colSpan={visible.length + 4}
                      >
                        {m.loading ? t("common.loading") : tr("empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {readable && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span>{t("table.total", { count: m.total })}</span>
              <div className="flex items-center gap-3">
                <SimpleSelect
                  ariaLabel={t("table.pageSize")}
                  value={m.size}
                  onChange={(v) => {
                    m.setSize(Number(v));
                    m.setPage(1);
                  }}
                  options={[10, 20, 50, 100].map((value) => ({
                    value,
                    label: String(value),
                  }))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={m.page === 1 || m.loading}
                  onClick={() => m.setPage(m.page - 1)}
                >
                  {t("common.previous")}
                </Button>
                <span>
                  {m.page} / {Math.max(1, Math.ceil(m.total / m.size))}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={m.page * m.size >= m.total || m.loading}
                  onClick={() => m.setPage(m.page + 1)}
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return (
    <>
      <PageMeta
        title={tr(sent ? "manage" : "inbox")}
        description={tr(sent ? "manage" : "inbox")}
      />
      {!embedded && (
        <PageBreadCrumb pageTitle={tr(sent ? "manage" : "inbox")} />
      )}
      {embedded ? (
        <Modal
          ariaLabel={tr("history")}
          isOpen
          isFullscreen
          onClose={closeHistory}
          className="overflow-auto bg-gray-50 p-6 dark:bg-gray-950"
          showCloseButton
          closeLabel={tr("close")}
        >
          <h1 className="mb-5 text-xl font-semibold">{tr("history")}</h1>
          {body}
        </Modal>
      ) : fullscreen ? (
        createPortal(body, document.body)
      ) : (
        body
      )}
      <AdminDrawer open={m.detail} title={tr("detail")} onClose={m.closeDetail}>
        <h2 className="mb-5 text-xl font-semibold">{tr("detail")}</h2>
        {m.detailLoading ? (
          <p>{t("common.loading")}</p>
        ) : (
          m.selected && (
            <>
              <h3 className="text-lg font-semibold break-words">
                {m.selected.title}
              </h3>
              <p>{date(m.selected.published_at)}</p>
              <p className="my-5 max-h-96 overflow-auto break-words whitespace-pre-wrap">
                {m.selected.content}
              </p>
              <p>
                {tr("expiry")}:{" "}
                {m.selected.expired_at
                  ? date(m.selected.expired_at)
                  : tr("noExpiry")}
              </p>
              {sent && m.selected.scope === "targeted" && (
                <section className="mt-5 rounded-lg border p-4">
                  <h3>
                    {text("msg.recipients")} ·{" "}
                    {text("msg.recipientCount", {
                      count: m.selected.recipient_ids?.length ?? m.selected.recipients?.length ?? 0,
                    })}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.selected.recipients?.length ? (
                      m.selected.recipients.map((recipient) => (
                        <span
                          key={recipient.id}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          {recipient.username} · {recipient.code}
                        </span>
                      ))
                    ) : (
                      <p>{text("msg.recipientsUnavailable")}</p>
                    )}
                  </div>
                </section>
              )}
            </>
          )
        )}
        <div className="mt-5">
          <Button type="button" variant="outline" onClick={m.closeDetail}>
            {tr("cancel")}
          </Button>
        </div>
      </AdminDrawer>
      <AdminDrawer
        open={m.compose}
        title={tr("send")}
        onClose={closeCompose}
        footer={
          <div className="mt-5 flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={m.busy}
              onClick={closeCompose}
            >
              {tr("cancel")}
            </Button>
            <Button
              type="button"
              disabled={m.busy}
              onClick={() => void m.send()}
            >
              {tr("send")}
            </Button>
          </div>
        }
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void m.send();
          }}
        >
          <fieldset disabled={m.busy} className="space-y-4">
            <div>
              <Label htmlFor="msg-title">{tr("title")}</Label>
              <Input
                id="msg-title"
                value={m.draft.title}
                onChange={(e) =>
                  m.setDraft((d) => ({ ...d, title: e.target.value }))
                }
                error={m.attempted && !!m.issues.title}
                hint={m.attempted ? m.issues.title : ""}
              />
            </div>
            <div>
              <Label htmlFor="msg-content">{tr("content")}</Label>
              <TextArea
                id="msg-content"
                value={m.draft.content}
                onChange={(content) => m.setDraft((d) => ({ ...d, content }))}
                error={m.attempted && !!m.issues.content}
                hint={m.attempted ? m.issues.content : ""}
              />
            </div>
            <div>
              <Label htmlFor="msg-type">{tr("type")}</Label>
              <SimpleSelect
                id="msg-type"
                ariaLabel={tr("type")}
                value={m.draft.type}
                onChange={(v) =>
                  m.setDraft((d) => ({ ...d, type: v as "notice" | "system" }))
                }
                options={["notice", "system"].map((value) => ({
                  value,
                  label: tr(value),
                }))}
              />
            </div>
            <div>
              <Label htmlFor="msg-scope">{tr("scope")}</Label>
              <SimpleSelect
                id="msg-scope"
                ariaLabel={tr("scope")}
                value={m.draft.scope}
                onChange={(v) =>
                  m.setDraft((d) => ({ ...d, scope: v as "all" | "targeted" }))
                }
                options={["all", "targeted"].map((value) => ({
                  value,
                  label: tr(value),
                }))}
              />
            </div>
            {m.draft.scope === "targeted" && (
              <div>
                <Label htmlFor="msg-recipients">{tr("recipients")}</Label>
                <AssociationEditor
                  resource="user"
                  kind="recipient"
                  value={m.draft.recipient_ids ?? []}
                  onChange={(value) =>
                    m.setDraft((draft) => ({
                      ...draft,
                      recipient_ids: value.map(Number),
                    }))
                  }
                />

                {m.attempted && m.issues.recipients && (
                  <p className="text-error-500" role="alert">
                    {m.issues.recipients}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="msg-expiry">{tr("expiry")}</Label>
              <Input
                id="msg-expiry"
                type="datetime-local"
                value={m.expiry}
                onChange={(e) => m.setExpiry(e.target.value)}
                error={m.attempted && !!m.issues.expiry}
                hint={m.attempted ? m.issues.expiry : ""}
              />
            </div>
            {m.sendError && (
              <p role="alert" className="text-error-500">
                {m.sendError}
              </p>
            )}
          </fieldset>
        </form>
      </AdminDrawer>
      <Modal
        ariaLabel={tr("confirm")}
        isOpen={!!m.confirmation || discard}
        onClose={() => {
          if (!m.busy) {
            m.setConfirmation("");
            setDiscard(false);
          }
        }}
        showCloseButton={false}
        className="m-4 max-w-lg p-6"
      >
        <h2 className="mb-5 text-xl font-semibold">{tr("confirm")}</h2>
        <p>
          {tr(
            discard
              ? "unsaved"
              : m.confirmation === "readSelected"
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
        {m.error && <p role="alert">{m.error}</p>}
        <div className="mt-5 flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={m.busy}
            onClick={() => {
              m.setConfirmation("");
              setDiscard(false);
            }}
          >
            {tr("cancel")}
          </Button>
          <Button
            type="button"
            disabled={m.busy}
            onClick={() => {
              if (discard) {
                setDiscard(false);
                m.setCompose(false);
              } else
                void m.confirm().then((success) => {
                  if (success) setCheckedKeys([]);
                });
            }}
          >
            {tr("confirm")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default function MessagePage(props: {
  sent?: boolean;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const text = useAdminText();
  const navigate = useNavigate();
  const auth = useAuth();
  const close = () =>
    props.onClose ? props.onClose() : navigate("/dashboard/overview");
  if (props.sent) return <LegacyMessagePage {...props} />;
  if (!messagePermissions(auth).canRead) return <p>{text("msg.noPermission")}</p>;
  return (
    <AdminDrawer bare open title={text("msg.history")} onClose={close}>
      <InboxFeed onClose={close} />
    </AdminDrawer>
  );
}

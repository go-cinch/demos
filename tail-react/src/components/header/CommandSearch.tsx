import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import Input from "@/components/form/input/InputField";
export default function CommandSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    auth = useAuth(),
    navigate = useNavigate(),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    list = useRef<HTMLDivElement>(null);
  const items = [
    ["/dashboard/overview", "dashboard.overview"],
    ["/dashboard/workspace", "dashboard.workspace"],
    ["/system/user", "system.users"],
    ["/system/role", "system.roles"],
    ["/system/user-group", "system.userGroups"],
    ["/system/action", "system.actions"],
    ["/system/dictionary", "system.dictionaries"],
    ["/system/developer", "developer.title"],
    ["/system/msg", "msg.manage"],
    ["/audit/login", "pc.audit.login"],
    ["/audit/operation", "pc.audit.operation"],
    ["/profile", "profile.title"],
  ].filter(
    ([path, key]) =>
      (path === "/profile" ||
        auth.canMenu(path)) &&
      String(t(key))
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  function enter(path: string) {
    onClose();
    setQuery("");
    navigate(path);
  }
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabel={t("header.search")}
      className="max-w-xl p-6"
    >
      <h2 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("header.search")}
      </h2>
      <Input
        aria-label={t("header.search")}
        placeholder={t("header.searchPlaceholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelected((value) => Math.min(items.length - 1, value + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelected((value) => Math.max(0, value - 1));
          }
          if (event.key === "Enter" && items[selected]) {
            event.preventDefault();
            enter(items[selected][0]);
          }
        }}
      />
      <div
        ref={list}
        className="mt-4 max-h-80 space-y-1 overflow-auto"
        role="listbox"
      >
        {items.map(([path, key], index) => (
          <button
            type="button"
            role="option"
            aria-selected={selected === index}
            key={path}
            className="block w-full rounded-lg px-4 py-3 text-start text-sm text-gray-700 hover:bg-gray-50 aria-selected:bg-brand-50 aria-selected:text-brand-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:aria-selected:bg-brand-500/10"
            onClick={() => enter(path)}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </Modal>
  );
}

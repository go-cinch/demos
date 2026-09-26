import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { BellAltIcon, CloseIcon } from "@/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function NotificationDropdown() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        aria-label={t("header.messages")}
        className="relative flex size-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
        onClick={() => setOpen((value) => !value)}
        title={t("header.messages")}
        type="button"
      >
        <BellAltIcon className="size-5" />
      </button>
      <Dropdown
        className="absolute inset-e-0 mt-3 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">
            {t("header.messages")}
          </h2>
          <button
            aria-label={t("common.cancel")}
            onClick={() => setOpen(false)}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("header.noMessages")}
        </p>
      </Dropdown>
    </div>
  );
}

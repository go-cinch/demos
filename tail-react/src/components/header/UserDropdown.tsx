import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { useAuth } from "@/context/AuthContext";
import { LogoutIcon, UserCircleIcon } from "@/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

export default function UserDropdown() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        aria-label={t("header.account")}
        className="flex items-center gap-3 text-gray-700 dark:text-gray-300"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15">
          <UserCircleIcon className="size-6" />
        </span>
        <span className="hidden text-sm font-medium lg:block">
          {auth.user?.username}
        </span>
        <span className="text-xs">⌄</span>
      </button>
      <Dropdown
        className="absolute inset-e-0 mt-3 flex w-64 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        <div className="border-b border-gray-200 px-2 pb-3 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {auth.user?.username}
          </p>
          <p className="text-xs text-gray-500">
            {auth.user?.role?.name || auth.user?.code}
          </p>
        </div>
        <Link
          className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          onClick={() => setOpen(false)}
          to="/profile"
        >
          <UserCircleIcon className="size-5" />
          {t("nav.profile")}
        </Link>
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          onClick={async () => {
            await auth.logout();
            navigate("/auth/login", { replace: true });
          }}
          type="button"
        >
          <LogoutIcon className="size-5" />
          {t("auth.logout")}
        </button>
      </Dropdown>
    </div>
  );
}

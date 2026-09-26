import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import Switch from "@/components/form/switch/Switch";
import UserDropdown from "@/components/header/UserDropdown";
import { useLanguage } from "@/context/LanguageContext";
import { useCopyright } from "@/context/CopyrightContext";
import { useSidebar } from "@/context/SidebarContext";
import {
  AspectIcon,
  ClockIcon,
  GlobeIcon,
  LockIcon,
  SearchIcon,
  SettingsAltIcon,
} from "@/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export default function AppHeader() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { preferences: copyright, update: updateCopyright } = useCopyright();
  const [lockSetup, setLockSetup] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockPassword, setLockPassword] = useState("");
  const [lockEntry, setLockEntry] = useState("");
  const [lockError, setLockError] = useState("");
  const toggle = () =>
    window.innerWidth >= 1280 ? toggleSidebar() : toggleMobileSidebar();
  const iconClass =
    "flex size-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800";
  const toggleAccent = () => {
    const next =
      document.documentElement.dataset.accent === "purple" ? "blue" : "purple";
    document.documentElement.dataset.accent = next;
    localStorage.setItem("color-accent", next);
  };

  return (
    <>
      <header className="sticky top-0 z-999 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 xl:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label={t("header.toggleSidebar")}
              className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400 ${isMobileOpen ? "bg-gray-100 dark:bg-white/3" : ""}`}
              onClick={toggle}
              type="button"
            >
              <span className="text-xl">☰</span>
            </button>
            <Link className="xl:hidden" to="/dashboard/overview">
              <img
                alt="Go Cinch"
                className="h-9 dark:hidden"
                src="/images/logo/go-cinch.svg"
              />
              <img
                alt="Go Cinch"
                className="hidden h-9 dark:block"
                src="/images/logo/go-cinch-white.svg"
              />
            </Link>
            {searchOpen && (
              <input
                autoFocus
                className="hidden h-10 w-48 rounded-lg border border-gray-300 bg-transparent px-3 text-sm outline-none focus:border-brand-400 md:block dark:border-gray-700"
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                }}
                placeholder={t("header.searchPlaceholder")}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              aria-label={t("header.search")}
              className={iconClass}
              onClick={() => setSearchOpen((value) => !value)}
              title={t("header.search")}
              type="button"
            >
              <SearchIcon className="size-5" />
            </button>
            <button
              aria-label={t("header.advanced")}
              className={`${iconClass} hidden sm:flex`}
              onClick={() => setSettingsOpen(true)}
              title={t("header.advanced")}
              type="button"
            >
              <SettingsAltIcon className="size-5" />
            </button>
            <ThemeToggleButton />
            <button
              aria-label={t("header.language")}
              className={`${iconClass} hidden sm:flex`}
              onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
              title={t("header.language")}
              type="button"
            >
              <GlobeIcon className="size-5" />
            </button>
            <button
              aria-label={t("header.timezone", {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })}
              className={`${iconClass} hidden md:flex`}
              title={t("header.timezone", {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })}
              type="button"
            >
              <ClockIcon className="size-5" />
            </button>
            <button
              aria-label={t("header.fullscreen")}
              className={`${iconClass} hidden md:flex`}
              onClick={() =>
                document.fullscreenElement
                  ? void document.exitFullscreen()
                  : void document.documentElement.requestFullscreen()
              }
              title={t("header.fullscreen")}
              type="button"
            >
              <AspectIcon className="size-5" />
            </button>
            <NotificationDropdown />
            <button
              aria-label={t("header.lock")}
              className={`${iconClass} hidden sm:flex`}
              onClick={() => {
                setLockPassword("");
                setLockError("");
                setLockSetup(true);
              }}
              title={t("header.lock")}
              type="button"
            >
              <LockIcon className="size-5" />
            </button>
            <UserDropdown />
          </div>
        </div>
      </header>
      {settingsOpen && (
        <div className="fixed inset-0 z-999999 flex justify-end bg-gray-950/40" onClick={() => setSettingsOpen(false)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-theme-xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t("settings.title")}</h2>
              <button type="button" className={iconClass} onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("settings.layout")}</h3>
            <button type="button" className="mt-4 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700" onClick={toggleAccent}>{t("settings.accent")}</button>
            <h4 className="mt-8 font-semibold text-gray-900 dark:text-white">{t("settings.copyright")}</h4>
            <div className="mt-4 flex items-center justify-between gap-4 text-sm"><span>{t("settings.enabled")}</span><Switch checked={copyright.enabled} onChange={(enabled) => updateCopyright({ enabled })} /></div>
            {([['date', 'date'], ['company', 'company'], ['companyLink', 'companyLink'], ['icp', 'icp'], ['icpLink', 'icpLink']] as const).map(([key, label]) => (
              <label className="mt-4 block text-sm" key={key}><span>{t(`settings.${label}`)}</span><input className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 dark:border-gray-700" value={copyright[key]} onChange={(event) => updateCopyright({ [key]: event.target.value })} /></label>
            ))}
          </aside>
        </div>
      )}
      {lockSetup && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-gray-950/60 p-6 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-theme-xl dark:bg-gray-900"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!lockPassword) {
                setLockError(t("header.lockPasswordRequired"));
                return;
              }
              setLockEntry("");
              setLockError("");
              setLockSetup(false);
              setLocked(true);
            }}
          >
            <LockIcon className="mx-auto mb-4 size-10 text-brand-500" />
            <h2 className="text-center text-xl font-semibold text-gray-800 dark:text-white">
              {t("header.lock")}
            </h2>
            <input
              autoFocus
              className={`mt-6 h-11 w-full rounded-lg border bg-transparent px-4 text-sm outline-none ${lockError ? "border-error-500" : "border-gray-300 focus:border-brand-400 dark:border-gray-700"}`}
              onChange={(event) => {
                setLockPassword(event.target.value);
                setLockError("");
              }}
              placeholder={t("header.lockPassword")}
              type="password"
              value={lockPassword}
            />
            {lockError && (
              <p className="mt-1.5 text-xs text-error-500" role="alert">
                {lockError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
                onClick={() => setLockSetup(false)}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                {t("header.lock")}
              </button>
            </div>
          </form>
        </div>
      )}
      {locked && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-gray-950/80 p-6 backdrop-blur-sm">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-theme-xl dark:bg-gray-900"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (lockEntry !== lockPassword) {
                setLockError(t("header.lockPasswordError"));
                return;
              }
              setLocked(false);
              setLockEntry("");
              setLockError("");
            }}
          >
            <LockIcon className="mx-auto mb-4 size-10 text-brand-500" />
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              {t("header.locked")}
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t("header.lockedHint")}
            </p>
            <input
              autoFocus
              className={`mt-6 h-11 w-full rounded-lg border bg-transparent px-4 text-start text-sm outline-none ${lockError ? "border-error-500" : "border-gray-300 focus:border-brand-400 dark:border-gray-700"}`}
              onChange={(event) => {
                setLockEntry(event.target.value);
                setLockError("");
              }}
              placeholder={t("header.lockPassword")}
              type="password"
              value={lockEntry}
            />
            {lockError && (
              <p
                className="mt-1.5 text-start text-xs text-error-500"
                role="alert"
              >
                {lockError}
              </p>
            )}
            <button
              className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
              type="submit"
            >
              {t("header.unlock")}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

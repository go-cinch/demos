import GridShape from "@/components/common/GridShape";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { GlobeIcon, LayoutIcon, MoonIcon, SparkIcon, SunIcon } from "@/icons";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Copyright } from "@/context/CopyrightContext";

type PanelPosition = "start" | "end";
type Accent = "blue" | "purple";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [position, setPosition] = useState<PanelPosition>(() =>
    localStorage.getItem("auth-panel-position") === "end" ? "end" : "start",
  );
  const [accent, setAccent] = useState<Accent>(() =>
    localStorage.getItem("color-accent") === "purple" ? "purple" : "blue",
  );

  useEffect(
    () => localStorage.setItem("auth-panel-position", position),
    [position],
  );
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("color-accent", accent);
  }, [accent]);

  const controlClass =
    "flex size-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-theme-xs transition hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

  return (
    <div className="relative z-1 min-h-screen bg-white p-6 sm:p-0 dark:bg-gray-900">
      <Link
        className="fixed start-4 top-4 z-50 flex min-w-0 max-w-[calc(100vw-12rem)] items-center gap-2 text-gray-900 sm:start-6 sm:top-6 sm:max-w-[calc(100vw-22rem)] dark:text-white"
        to="/auth/login"
      >
        <img className="size-9 dark:hidden" src="/images/logo/go-cinch.svg" alt="Go Cinch" />
        <img className="hidden size-9 dark:block" src="/images/logo/go-cinch-white.svg" alt="Go Cinch" />
        <span className="text-base font-semibold sm:hidden">Go Cinch</span>
        <span className="hidden text-lg font-semibold sm:inline xl:hidden">Go Cinch Admin</span>
        <span className="hidden text-xl font-semibold xl:inline">Go Cinch Admin by TailAdmin</span>
      </Link>
      <div className="fixed inset-e-4 top-4 z-50 flex items-center gap-2 sm:inset-e-6 sm:top-6">
        <button
          aria-label={t("authControls.color")}
          className={controlClass}
          onClick={() =>
            setAccent((value) => (value === "blue" ? "purple" : "blue"))
          }
          title={t("authControls.color")}
          type="button"
        >
          <SparkIcon className="size-5" />
        </button>
        <button
          aria-label={t("authControls.position")}
          className={`${controlClass} hidden lg:flex`}
          onClick={() =>
            setPosition((value) => (value === "start" ? "end" : "start"))
          }
          title={t("authControls.position")}
          type="button"
        >
          <LayoutIcon className="size-5" />
        </button>
        <button
          aria-label={t("authControls.language")}
          className={controlClass}
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          title={t("authControls.language")}
          type="button"
        >
          <GlobeIcon className="size-5" />
        </button>
        <button
          aria-label={t("authControls.theme")}
          className={controlClass}
          onClick={toggleTheme}
          title={t("authControls.theme")}
          type="button"
        >
          {theme === "dark" ? (
            <SunIcon className="size-5" />
          ) : (
            <MoonIcon className="size-5" />
          )}
        </button>
      </div>
      <div
        className={`relative flex min-h-screen w-full flex-col justify-center lg:flex-row ${position === "end" ? "lg:flex-row-reverse" : ""}`}
      >
        <div className="flex min-w-0 flex-1 px-1 pt-14 sm:px-8 lg:pt-0">
          {children}
        </div>
        <div className="hidden min-w-0 flex-1 items-center bg-brand-950 lg:grid dark:bg-white/5">
          <div className="relative z-1 flex items-center justify-center overflow-hidden px-8">
            <GridShape />
            <div className="flex max-w-full flex-col items-center">
              <p className="text-center text-gray-300 dark:text-white/60">
                {t("app.tagline")}
              </p>
            </div>
          </div>
        </div>
      </div>
      <Copyright className="fixed inset-x-0 bottom-4 z-40 text-center text-xs text-gray-500 [&_a]:text-brand-500" />
    </div>
  );
}

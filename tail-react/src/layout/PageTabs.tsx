import { CloseIcon, StarFill, StarLine } from "@/icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

interface PageTab {
  path: string;
  pinned: boolean;
}

const overview: PageTab = { path: "/dashboard/overview", pinned: true };

function readTabs(): PageTab[] {
  try {
    const tabs = JSON.parse(
      sessionStorage.getItem("admin-page-tabs") || "[]",
    ) as PageTab[];
    return [overview, ...tabs.filter((tab) => tab.path !== overview.path)];
  } catch {
    return [overview];
  }
}

const labelKeys: Record<string, string> = {
  "/dashboard/overview": "dashboard.overview",
  "/dashboard/workspace": "dashboard.workspace",
  "/profile": "profile.title",
  "/system/user": "system.users",
  "/system/role": "system.roles",
  "/system/user-group": "system.userGroups",
  "/system/action": "system.actions",
  "/system/dictionary": "system.dictionaries",
  "/system/whitelist": "system.whitelists",
};

export default function PageTabs() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<PageTab[]>(readTabs);

  useEffect(() => {
    if (!labelKeys[location.pathname]) return;
    setTabs((current) =>
      current.some((tab) => tab.path === location.pathname)
        ? current
        : [...current, { path: location.pathname, pinned: false }],
    );
  }, [location.pathname]);
  useEffect(
    () => sessionStorage.setItem("admin-page-tabs", JSON.stringify(tabs)),
    [tabs],
  );

  const close = (path: string) => {
    const index = tabs.findIndex((tab) => tab.path === path);
    const next = tabs.filter((tab) => tab.path !== path || tab.pinned);
    setTabs(next);
    if (path === location.pathname)
      navigate(next[Math.max(0, index - 1)]?.path || overview.path);
  };

  return (
    <div
      className="no-scrollbar flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 xl:px-6 dark:border-gray-800 dark:bg-gray-900"
      aria-label={t("tabs.openPages")}
    >
      {tabs.map((tab) => (
        <div
          className={`group flex shrink-0 items-center rounded-lg border text-sm ${location.pathname === tab.path ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-500/15 dark:text-brand-300" : "border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400"}`}
          key={tab.path}
        >
          <button
            className="px-3 py-1.5"
            onClick={() => navigate(tab.path)}
            type="button"
          >
            {t(labelKeys[tab.path])}
          </button>
          {tab.path !== overview.path && (
            <button
              aria-label={tab.pinned ? t("tabs.unpin") : t("tabs.pin")}
              className="hidden p-1 group-focus-within:block group-hover:block focus:block"
              onClick={() =>
                setTabs((current) =>
                  current.map((item) =>
                    item.path === tab.path
                      ? { ...item, pinned: !item.pinned }
                      : item,
                  ),
                )
              }
              title={tab.pinned ? t("tabs.unpin") : t("tabs.pin")}
              type="button"
            >
              {tab.pinned ? (
                <StarFill className="size-3.5" />
              ) : (
                <StarLine className="size-3.5" />
              )}
            </button>
          )}
          {!tab.pinned && (
            <button
              aria-label={t("tabs.close")}
              className="me-1 p-1"
              onClick={() => close(tab.path)}
              title={t("tabs.close")}
              type="button"
            >
              <CloseIcon className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import {
  ChevronDownIcon,
  DashboardAltIcon,
  GridIcon,
  KeyIcon,
  ListIcon,
  SettingsAltIcon,
  UserCircleIcon,
  UserIcon,
} from "@/icons";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

type MenuIcon = ComponentType<SVGProps<SVGSVGElement>>;

const dashboardItems = [
  {
    path: "/dashboard/overview",
    label: "dashboard.overview",
    icon: DashboardAltIcon,
  },
  {
    path: "/dashboard/workspace",
    label: "dashboard.workspace",
    icon: GridIcon,
  },
];

const systemItems = [
  {
    permission: "/system/user",
    path: "/system/user",
    label: "system.users",
    icon: UserIcon,
  },
  {
    permission: "/system/role",
    path: "/system/role",
    label: "system.roles",
    icon: KeyIcon,
  },
  {
    permission: "/system/group",
    path: "/system/user-group",
    label: "system.userGroups",
    icon: UserCircleIcon,
  },
  {
    permission: "/system/action",
    path: "/system/action",
    label: "system.actions",
    icon: KeyIcon,
  },
  {
    permission: "/system/dictionary",
    path: "/system/dictionary",
    label: "system.dictionaries",
    icon: ListIcon,
  },
  {
    permission: "/system/whitelist",
    path: "/system/whitelist",
    label: "system.whitelists",
    icon: ListIcon,
  },
];

function MenuSection({
  icon: Icon,
  label,
  open,
  showText,
  toggle,
  children,
}: {
  icon: MenuIcon;
  label: string;
  open: boolean;
  showText: boolean;
  toggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        aria-expanded={open}
        className={`group menu-item w-full menu-item-inactive ${showText ? "xl:justify-start" : "xl:justify-center"}`}
        onClick={toggle}
        type="button"
      >
        <Icon className="menu-item-icon-size" />
        {showText && (
          <>
            <span className="menu-item-text flex-1 text-start">{label}</span>
            <ChevronDownIcon
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>
      {showText && open && (
        <ul className="mt-1 space-y-1 overflow-hidden ps-9">{children}</ul>
      )}
    </li>
  );
}

export default function AppSidebar() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, setIsMobileOpen } =
    useSidebar();
  const showText = isExpanded || isHovered || isMobileOpen;
  const [sections, setSections] = useState({
    dashboard: location.pathname.startsWith("/dashboard"),
    system: location.pathname.startsWith("/system"),
  });

  useEffect(() => {
    if (isMobileOpen) setIsMobileOpen(false);
    if (location.pathname.startsWith("/dashboard"))
      setSections((value) => ({ ...value, dashboard: true }));
    if (location.pathname.startsWith("/system"))
      setSections((value) => ({ ...value, system: true }));
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemClass = (path: string) =>
    `menu-dropdown-item block ${location.pathname === path ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`;
  const toggleSection = (section: "dashboard" | "system") =>
    setSections((value) => ({ ...value, [section]: !value[section] }));

  return (
    <aside
      className={`fixed start-0 top-0 z-9999 mt-16 flex h-screen flex-col border-e border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out xl:mt-0 dark:border-gray-800 dark:bg-gray-900 ${isExpanded || isMobileOpen ? "w-72.5" : isHovered ? "w-72.5" : "w-22.5"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"} xl:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex py-8 ${showText ? "justify-start" : "justify-center"}`}
      >
        <Link className="flex items-center gap-3" to="/dashboard/overview">
          <img
            alt="Go Cinch"
            className="size-10 shrink-0 dark:hidden"
            src="/images/logo/go-cinch.svg"
          />
          <img
            alt="Go Cinch"
            className="hidden size-10 shrink-0 dark:block"
            src="/images/logo/go-cinch-white.svg"
          />
          {showText && (
            <span className="text-lg font-semibold text-gray-800 dark:text-white">
              {t("app.name")}
            </span>
          )}
        </Link>
      </div>
      <nav className="no-scrollbar flex flex-col overflow-y-auto pb-24">
        <h2
          className={`mb-4 flex text-xs leading-5 text-gray-400 uppercase ${showText ? "justify-start" : "justify-center"}`}
        >
          {showText ? t("nav.main") : "•••"}
        </h2>
        <ul className="flex flex-col gap-1">
          <MenuSection
            icon={GridIcon}
            label={t("dashboard.title")}
            open={sections.dashboard}
            showText={showText}
            toggle={() => toggleSection("dashboard")}
          >
            {dashboardItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <Link
                    className={`${itemClass(item.path)} flex items-center gap-2`}
                    to={item.path}
                  >
                    <Icon className="size-4" />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </MenuSection>
          <MenuSection
            icon={SettingsAltIcon}
            label={t("nav.management")}
            open={sections.system}
            showText={showText}
            toggle={() => toggleSection("system")}
          >
            {systemItems
              .filter((item) => auth.canMenu(item.permission))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      className={`${itemClass(item.path)} flex items-center gap-2`}
                      to={item.path}
                    >
                      <Icon className="size-4" />
                      {t(item.label)}
                    </Link>
                  </li>
                );
              })}
          </MenuSection>
        </ul>
      </nav>
    </aside>
  );
}

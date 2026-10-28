import type { PermissionNavigation } from "@/api/auth";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import {
  BellAltIcon,
  GroupIcon,
  ShieldIcon,
  DocsIcon,
  ClockIcon,
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
  { permission: "/system/developer", path: "/system/developer", label: "developer.title", icon: SettingsAltIcon },
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
    icon: ShieldIcon,
  },
  {
    permission: "/system/user-group",
    path: "/system/user-group",
    label: "system.userGroups",
    icon: GroupIcon,
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
    icon: DocsIcon,
  },
  {
    permission: "/system/msg",
    path: "/system/msg",
    label: "msg.manage",
    icon: BellAltIcon,
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


function CatalogNavigation({ nodes, showText }: { nodes: PermissionNavigation[]; showText: boolean }) {
  const { t } = useTranslation(); const location = useLocation();
  const [opened, setOpened] = useState<Record<string,boolean>>({});
  const contains = (node: PermissionNavigation): boolean => node.menu_path === location.pathname || (node.children ?? []).some(contains);
  const visible = (node: PermissionNavigation): PermissionNavigation[] => {
    if (node.menu_path) return node.menu_path.startsWith('/dashboard/') ? [] : [node];
    const children = (node.children ?? []).flatMap(visible); return children.length ? [{...node,children}] : [];
  };
  return <>{nodes.flatMap(visible).map(node => {
    const fallback = systemItems.find(item => item.path === node.menu_path)?.label ?? (node.menu_path?.startsWith('/audit/') ? `pc.audit.${node.menu_path.split('/').at(-1)}` : node.resource_key);
    const label = String(t(`resources.${node.resource_key}`,{defaultValue:String(t(fallback))}));
    const Icon = systemItems.find(item => item.path === node.menu_path)?.icon
      ?? (node.menu_path === '/audit/login' ? UserCircleIcon : node.menu_path === '/audit/operation' ? ClockIcon : SettingsAltIcon);
    if (node.menu_path) return <li key={`${node.resource_key}:${node.menu_key}`}><Link className={`menu-item ${location.pathname === node.menu_path ? 'menu-item-active' : 'menu-item-inactive'}`} to={node.menu_path}><Icon className="size-5"/>{showText&&<span className="break-words">{label}</span>}</Link></li>;
    const open = opened[node.resource_key] ?? contains(node);
    return <MenuSection key={node.resource_key} icon={SettingsAltIcon} label={label} open={open} showText={showText} toggle={()=>setOpened(old=>({...old,[node.resource_key]:!open}))}><CatalogNavigation nodes={node.children??[]} showText={showText}/></MenuSection>;
  })}</>;
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
    audit: location.pathname.startsWith("/audit"),
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
  const toggleSection = (section: "dashboard" | "system" | "audit") =>
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
            {dashboardItems
              .filter((item) => auth.canMenu(item.path))
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
          {auth.user?.permission.navigation?.length ? <CatalogNavigation nodes={auth.user.permission.navigation} showText={showText} /> : <>
          {systemItems.some((item) => auth.canMenu(item.permission)) && (
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
          )}
          {["login", "operation"].some((kind) =>
            auth.canMenu(`/audit/${kind}`),
          ) && (
            <MenuSection
              icon={ListIcon}
              label={t("pc.audit.menu")}
              open={sections.audit}
              showText={showText}
              toggle={() => toggleSection("audit")}
            >
              {["login", "operation"]
                .filter((kind) => auth.canMenu(`/audit/${kind}`))
                .map((kind) => (
                  <li key={kind}>
                    <Link
                      className={itemClass(`/audit/${kind}`)}
                      to={`/audit/${kind}`}
                    >
                      {t(`pc.audit.${kind}`)}
                    </Link>
                  </li>
                ))}
            </MenuSection>
          )}
          </>}
        </ul>
      </nav>
    </aside>
  );
}

import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { cn } from "@/utils";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";
import PageTabs from "./PageTabs";
import { Copyright } from "@/context/CopyrightContext";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen">
      <AppSidebar />
      <Backdrop />

      <div
        className={cn(
          "min-w-0 transition-[margin] duration-300 ease-in-out",
          isExpanded || isHovered ? "xl:ms-72.5" : "xl:ms-22.5",
          isMobileOpen ? "ms-0" : "",
        )}
      >
        <AppHeader />
        <PageTabs />
        <div className="flex min-h-[calc(100vh-73px)] flex-col">
          <main className="mx-auto w-full max-w-(--breakpoint-2xl) flex-1 p-4 md:p-6">
            <Outlet />
          </main>
          <footer className="border-t border-gray-200 px-4 py-5 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <Copyright className="[&_a]:text-brand-500 [&_a:hover]:text-brand-600" />
          </footer>
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;

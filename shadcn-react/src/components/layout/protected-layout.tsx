import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { PageTabs } from '@/components/layout/page-tabs';
import { AppFooter } from '@/components/layout/app-footer';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DashboardGuard } from '@/features/auth/components/dashboard-guard';
import { cookies } from 'next/headers';

export async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <DashboardGuard>
      <KBar>
        <SidebarProvider defaultOpen={defaultOpen}>
          <a
            href='#main-content'
            className='bg-background ring-ring sr-only rounded-md px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:ring-2'
          >
            Skip to content
          </a>
          <AppSidebar />
          <SidebarInset id='main-content' tabIndex={-1} className='min-w-0 scroll-mt-16'>
            <Header />
            <PageTabs />
            <InfobarProvider defaultOpen={false}>
              {children}
              <AppFooter className='mt-auto' />
              <InfoSidebar side='right' />
            </InfobarProvider>
          </SidebarInset>
        </SidebarProvider>
      </KBar>
    </DashboardGuard>
  );
}

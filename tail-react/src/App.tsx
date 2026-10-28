import RequestFeedback from "@/components/common/RequestFeedback";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ScrollToTop } from "@/components/common/ScrollToTop";
import AppLayout from "@/layout/AppLayout";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, RouterProvider } from "react-router";

const ResetPassword = lazy(() => import("@/pages/AuthPages/ResetPassword"));
const SignIn = lazy(() => import("@/pages/AuthPages/SignIn"));
const SignUp = lazy(() => import("@/pages/AuthPages/SignUp"));
const Ecommerce = lazy(() => import("@/pages/Dashboard/Ecommerce"));
const Workspace = lazy(() => import("@/pages/Dashboard/Workspace"));
const NotFound = lazy(() => import("@/pages/OtherPage/NotFound"));
const Profile = lazy(() => import("@/pages/Profile/Profile"));
const MessagePage = lazy(() => import("@/pages/System/MessagePage"));
const AuditPage = lazy(() => import("@/pages/Audit/audit-page"));
const DeveloperWorkspace = lazy(() => import("@/pages/System/DeveloperWorkspace"));
const SystemManagement = lazy(() => import("@/pages/System/SystemManagement"));

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      {t("common.loading")}
    </div>
  );
}

function RouterLayout() {
  return <><RequestFeedback /><ScrollToTop /><Suspense fallback={<RouteFallback />}><Outlet /></Suspense></>;
}
const router = createBrowserRouter(createRoutesFromElements(<Route element={<RouterLayout />}>
          <Route path="/auth/login" element={<SignIn />} />
          <Route path="/auth/register" element={<SignUp />} />
          <Route
            path="/signin"
            element={<Navigate to="/auth/login" replace />}
          />
          <Route
            path="/signup"
            element={<Navigate to="/auth/register" replace />}
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route
              path="/reset-password"
              element={<Navigate to="/auth/reset-password" replace />}
            />
            <Route element={<AppLayout />}>
              <Route
                index
                element={<Navigate to="/dashboard/overview" replace />}
              />
              <Route path="/dashboard/overview" element={<Ecommerce />} />
              <Route path="/dashboard/workspace" element={<Workspace />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/msg/inbox" element={<MessagePage embedded />} />
              <Route path="/system/msg" element={<MessagePage sent />} />
              <Route path="/audit/login" element={<AuditPage kind="login" />} />
              <Route
                path="/audit/operation"
                element={<AuditPage kind="operation" />}
              />
              <Route path="/system/developer" element={<DeveloperWorkspace />} />
              <Route path="/system/:resource" element={<SystemManagement />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
</Route>));
export default function App() { return <RouterProvider router={router} />; }

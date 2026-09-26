import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { ScrollToTop } from "@/components/common/ScrollToTop";
import AppLayout from "@/layout/AppLayout";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router";

const ResetPassword = lazy(() => import("@/pages/AuthPages/ResetPassword"));
const SignIn = lazy(() => import("@/pages/AuthPages/SignIn"));
const SignUp = lazy(() => import("@/pages/AuthPages/SignUp"));
const Ecommerce = lazy(() => import("@/pages/Dashboard/Ecommerce"));
const Workspace = lazy(() => import("@/pages/Dashboard/Workspace"));
const NotFound = lazy(() => import("@/pages/OtherPage/NotFound"));
const Profile = lazy(() => import("@/pages/Profile/Profile"));
const SystemManagement = lazy(() => import("@/pages/System/SystemManagement"));

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      {t("common.loading")}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
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
              <Route path="/system/:resource" element={<SystemManagement />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

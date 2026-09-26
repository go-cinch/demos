import { useAuth } from "@/context/AuthContext";
import { Navigate, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

export default function ProtectedRoute() {
  const auth = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        {t("common.loading")}
      </div>
    );
  }
  if (
    auth.passwordResetRequired &&
    location.pathname !== "/auth/reset-password"
  ) {
    return <Navigate to="/auth/reset-password" replace />;
  }
  if (!auth.user && !auth.passwordResetRequired) {
    return (
      <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
    );
  }
  return <Outlet />;
}

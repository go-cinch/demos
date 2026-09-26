import { resetPassword } from "@/api/auth";
import { ApiError } from "@/api/client";
import PageMeta from "@/components/common/PageMeta";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { isValidUserPassword } from "@/utils/userValidation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import AuthLayout from "./AuthPageLayout";

export default function ResetPassword() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!isValidUserPassword(password))
      next.password = t("validation.password");
    if (password !== confirmation)
      next.confirmation = t("validation.passwordMismatch");
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setError("");
    try {
      await resetPassword(password);
      const rememberKey = `REMEMBER_ME_ACCOUNT_${location.hostname}`;
      try {
        const remembered = JSON.parse(localStorage.getItem(rememberKey) || "null") as
          | { username?: string; password?: string }
          | null;
        if (remembered?.username)
          localStorage.setItem(
            rememberKey,
            JSON.stringify({ ...remembered, password }),
          );
      } catch {
        localStorage.removeItem(rememberKey);
      }
      await auth.completeReset();
      navigate("/dashboard/overview", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t("errors.network"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta
        title={`${t("auth.resetPassword")} | TailAdmin`}
        description={t("auth.resetDescription")}
      />
      <AuthLayout>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
            {t("auth.resetPassword")}
          </h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {t("auth.resetDescription")}
          </p>
          <form className="space-y-5" noValidate onSubmit={submit}>
            <div>
              <Label htmlFor="reset-password">{t("auth.newPassword")}</Label>
              <Input
                autoComplete="new-password"
                error={Boolean(fieldErrors.password)}
                hint={fieldErrors.password}
                id="reset-password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((value) => ({ ...value, password: "" }));
                }}
                type="password"
                value={password}
              />
            </div>
            <div>
              <Label htmlFor="reset-confirm-password">
                {t("auth.confirmPassword")}
              </Label>
              <Input
                autoComplete="new-password"
                error={Boolean(fieldErrors.confirmation)}
                hint={fieldErrors.confirmation}
                id="reset-confirm-password"
                name="confirmPassword"
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setFieldErrors((value) => ({ ...value, confirmation: "" }));
                }}
                type="password"
                value={confirmation}
              />
            </div>
            {error && (
              <p
                className="rounded-lg bg-error-50 p-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
                role="alert"
              >
                {error}
              </p>
            )}
            <Button className="w-full" disabled={loading}>
              {loading ? t("common.loading") : t("auth.resetPassword")}
            </Button>
            <button
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
              onClick={async () => {
                await auth.logout();
                navigate("/auth/login", { replace: true });
              }}
              type="button"
            >
              {t("auth.logout")}
            </button>
          </form>
        </div>
      </AuthLayout>
    </>
  );
}

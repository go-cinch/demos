import {
  changePassword,
  refreshPasswordCaptcha,
  verifyPasswordCaptcha,
  type CaptchaPoint,
  type PointCaptchaChallenge,
} from "@/api/auth";
import { ApiError } from "@/api/client";
import PointCaptcha from "@/components/auth/PointCaptcha";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { isValidUserPassword } from "@/utils/userValidation";

export default function Profile() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"basic" | "password">("basic");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [captcha, setCaptcha] = useState<PointCaptchaChallenge>();
  const [points, setPoints] = useState<CaptchaPoint[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!isValidUserPassword(oldPassword))
      next.oldPassword = t("validation.password");
    if (!isValidUserPassword(newPassword))
      next.newPassword = t("validation.password");
    if (newPassword !== confirmation)
      next.confirmation = t("validation.passwordMismatch");
    if (captcha && points.length !== captcha.target_count)
      next.captcha = t("auth.pointRequired");
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    setError("");
    try {
      await changePassword(
        oldPassword,
        newPassword,
        captcha ? { id: captcha.captcha_id, points } : undefined,
      );
      await auth.logout();
      navigate("/auth/login", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextCaptcha = caught.data.captcha as
          PointCaptchaChallenge | undefined;
        if (caught.data.captcha_required && nextCaptcha)
          setCaptcha(nextCaptcha);
        else if (!caught.data.captcha_required) setCaptcha(undefined);
        setError(caught.message);
      } else setError(t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta
        title={`${t("profile.title")} | TailAdmin`}
        description={t("profile.description")}
      />
      <PageBreadCrumb pageTitle={t("profile.title")} />
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
        <div className="mb-6 flex gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "basic" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "text-gray-500"}`}
            onClick={() => setTab("basic")}
          >
            {t("profile.basic")}
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "password" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "text-gray-500"}`}
            onClick={() => setTab("password")}
          >
            {t("profile.changePassword")}
          </button>
        </div>
        {tab === "basic" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-gray-400 uppercase">
                {t("auth.username")}
              </p>
              <p className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {auth.user?.username}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">
                {t("fields.userCode")}
              </p>
              <p className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {auth.user?.code}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">
                {t("fields.role")}
              </p>
              <p className="mt-1 font-medium text-gray-800 dark:text-white/90">
                {auth.user?.role?.name || "-"}
              </p>
            </div>
          </div>
        ) : (
          <form className="max-w-lg space-y-5" noValidate onSubmit={submit}>
            <div>
              <Label htmlFor="current-password">
                {t("profile.currentPassword")}
              </Label>
              <Input
                autoComplete="current-password"
                error={Boolean(fieldErrors.oldPassword)}
                hint={fieldErrors.oldPassword}
                id="current-password"
                name="currentPassword"
                onChange={(event) => {
                  setOldPassword(event.target.value);
                  setFieldErrors((value) => ({ ...value, oldPassword: "" }));
                }}
                type="password"
                value={oldPassword}
              />
            </div>
            <div>
              <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
              <Input
                autoComplete="new-password"
                error={Boolean(fieldErrors.newPassword)}
                hint={fieldErrors.newPassword}
                id="new-password"
                name="newPassword"
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setFieldErrors((value) => ({ ...value, newPassword: "" }));
                }}
                type="password"
                value={newPassword}
              />
            </div>
            <div>
              <Label htmlFor="confirm-new-password">
                {t("auth.confirmPassword")}
              </Label>
              <Input
                autoComplete="new-password"
                error={Boolean(fieldErrors.confirmation)}
                hint={fieldErrors.confirmation}
                id="confirm-new-password"
                name="confirmPassword"
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setFieldErrors((value) => ({ ...value, confirmation: "" }));
                }}
                type="password"
                value={confirmation}
              />
            </div>
            {captcha && (
              <PointCaptcha
                captcha={captcha}
                onChange={(value) => {
                  setPoints(value);
                  setFieldErrors((errors) => ({ ...errors, captcha: "" }));
                }}
                onRefresh={async () =>
                  setCaptcha(await refreshPasswordCaptcha(captcha.captcha_id))
                }
                onVerify={async (selected) => {
                  const result = await verifyPasswordCaptcha(
                    captcha.captcha_id,
                    selected,
                  );
                  if (result.captcha) setCaptcha(result.captcha);
                  return result;
                }}
              />
            )}
            {fieldErrors.captcha && (
              <p className="text-xs text-error-500">{fieldErrors.captcha}</p>
            )}
            {error && (
              <p className="rounded-lg bg-error-50 p-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {error}
              </p>
            )}
            <Button disabled={loading}>
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}

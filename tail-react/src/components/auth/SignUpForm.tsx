import { register, usernameAvailability } from "@/api/auth";
import { ApiError } from "@/api/client";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { isValidUsername, isValidUserPassword } from "@/utils/userValidation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import SliderCaptcha from "./SliderCaptcha";

export default function SignUpForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [sliderProof, setSliderProof] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const checkUsername = async () => {
    const normalized = username.trim();
    if (!isValidUsername(normalized)) {
      setFieldErrors((value) => ({
        ...value,
        username: t("validation.username"),
      }));
      return false;
    }
    try {
      const result = await usernameAvailability(normalized);
      setFieldErrors((value) => ({
        ...value,
        username: result.available ? "" : t("auth.usernameExists"),
      }));
      return result.available;
    } catch {
      return true;
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const next: Record<string, string> = {};
    if (!isValidUsername(username.trim()))
      next.username = t("validation.username");
    if (!isValidUserPassword(password))
      next.password = t("validation.password");
    if (password !== confirmation)
      next.confirmation = t("validation.passwordMismatch");
    if (!sliderProof) next.verification = t("auth.sliderRequired");
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      if (!(await checkUsername())) return;
      await register(username.trim(), password, sliderProof);
      localStorage.setItem(
        `REMEMBER_ME_ACCOUNT_${location.hostname}`,
        JSON.stringify({ username: username.trim(), password }),
      );
      localStorage.removeItem(`REMEMBER_ME_CREDENTIALS_${location.hostname}`);
      navigate("/auth/login", { replace: true, state: { registered: true } });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t("errors.network"),
      );
      setSliderProof("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto no-scrollbar flex w-full max-w-md flex-1 flex-col justify-center overflow-y-auto py-8">
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
          {t("auth.signUp")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("auth.signUpDescription")}
        </p>
      </div>
      <form noValidate onSubmit={submit}>
        <div className="space-y-5">
          <div>
            <Label htmlFor="signup-username">
              {t("auth.username")} <span className="text-error-500">*</span>
            </Label>
            <Input
              autoComplete="username"
              error={Boolean(fieldErrors.username)}
              hint={fieldErrors.username}
              id="signup-username"
              name="username"
              onBlur={() => void checkUsername()}
              onChange={(event) => {
                setUsername(event.target.value);
                setSliderProof("");
                setFieldErrors((value) => ({
                  ...value,
                  username: "",
                  verification: "",
                }));
              }}
              value={username}
            />
          </div>
          <div>
            <Label htmlFor="signup-password">
              {t("auth.password")} <span className="text-error-500">*</span>
            </Label>
            <Input
              autoComplete="new-password"
              error={Boolean(fieldErrors.password)}
              hint={fieldErrors.password}
              id="signup-password"
              name="password"
              onBlur={() =>
                setFieldErrors((value) => ({
                  ...value,
                  password: isValidUserPassword(password)
                    ? ""
                    : t("validation.password"),
                }))
              }
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((value) => ({ ...value, password: "" }));
              }}
              type="password"
              value={password}
            />
          </div>
          <div>
            <Label htmlFor="signup-confirm-password">
              {t("auth.confirmPassword")}{" "}
              <span className="text-error-500">*</span>
            </Label>
            <Input
              autoComplete="new-password"
              error={Boolean(fieldErrors.confirmation)}
              hint={fieldErrors.confirmation}
              id="signup-confirm-password"
              name="confirmPassword"
              onBlur={() =>
                setFieldErrors((value) => ({
                  ...value,
                  confirmation:
                    password === confirmation
                      ? ""
                      : t("validation.passwordMismatch"),
                }))
              }
              onChange={(event) => {
                setConfirmation(event.target.value);
                setFieldErrors((value) => ({ ...value, confirmation: "" }));
              }}
              type="password"
              value={confirmation}
            />
          </div>
          <SliderCaptcha
            onVerified={(proof) => {
              setSliderProof(proof);
              if (proof)
                setFieldErrors((value) => ({ ...value, verification: "" }));
            }}
            purpose="register"
            resetKey={error}
            username={username}
          />
          {fieldErrors.verification && (
            <p className="-mt-3 text-xs text-error-500" role="alert">
              {fieldErrors.verification}
            </p>
          )}
          {error && (
            <p
              className="rounded-lg bg-error-50 p-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button className="w-full" disabled={loading}>
            {loading ? t("common.loading") : t("auth.signUp")}
          </Button>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {t("auth.hasAccount")}{" "}
            <Link
              className="font-medium text-brand-500 hover:text-brand-600"
              to="/auth/login"
            >
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

import {
  loginVerification,
  refreshLoginCaptcha,
  verifyLoginCaptcha,
  type CaptchaPoint,
  type PointCaptchaChallenge,
} from "@/api/auth";
import { ApiError } from "@/api/client";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { isValidUsername, isValidUserPassword } from "@/utils/userValidation";
import { consumeRegistrationLogin } from "@/utils/registrationLogin";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import PointCaptcha from "./PointCaptcha";
import SliderCaptcha from "./SliderCaptcha";
import LoginAccountInput from "./LoginAccountInput";

export default function SignInForm() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const route = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sliderProof, setSliderProof] = useState("");
  const [captcha, setCaptcha] = useState<PointCaptchaChallenge>();
  const [captchaPoints, setCaptchaPoints] = useState<CaptchaPoint[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const registrationApplied = useRef(false);

  useEffect(() => {
    if (registrationApplied.current) return;
    registrationApplied.current = true;
    const credentials = consumeRegistrationLogin();
    if (credentials) {
      setUsername(credentials.username);
      setPassword(credentials.password);
    }
  }, []);

  useEffect(() => {
    const normalized = username.trim();
    if (!isValidUsername(normalized)) {
      setCaptcha(undefined);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void loginVerification(normalized)
        .then((result) => {
          if (!active) return;
          setCaptcha(result.captcha_required ? result.captcha : undefined);
          setCaptchaPoints([]);
        })
        .catch(() => active && setCaptcha(undefined));
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [username]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!isValidUsername(username.trim()))
      next.username = t("validation.username");
    if (!isValidUserPassword(password))
      next.password = t("validation.password");
    if (!captcha && !sliderProof) next.verification = t("auth.sliderRequired");
    if (captcha && captchaPoints.length !== captcha.target_count)
      next.verification = t("auth.pointRequired");
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await auth.login({
        username: username.trim(),
        password,
        slider_proof: captcha ? "" : sliderProof,
        captcha_id: captcha?.captcha_id,
        captcha_points: captcha ? captchaPoints : undefined,
      });
      navigate(
        result.password_reset_required
          ? "/auth/reset-password"
          : (route.state as { from?: string } | null)?.from ||
              result.homePath ||
              "/dashboard/overview",
        { replace: true },
      );
    } catch (caught) {
      if (caught instanceof ApiError) {
        const nextCaptcha = caught.data.captcha as
          PointCaptchaChallenge | undefined;
        if (caught.data.captcha_required && nextCaptcha)
          setCaptcha(nextCaptcha);
        setError(caught.message);
      } else setError(t("errors.network"));
      setSliderProof("");
      setCaptchaPoints([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
          {t("auth.signIn")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("auth.signInDescription")}
        </p>
      </div>
      <form noValidate onSubmit={submit}>
        <div className="space-y-5">
          <div>
            <Label htmlFor="signin-username">
              {t("auth.username")} <span className="text-error-500">*</span>
            </Label>
            <LoginAccountInput
              error={fieldErrors.username}
              onBlur={() =>
                setFieldErrors((value) => ({
                  ...value,
                  username: isValidUsername(username.trim())
                    ? ""
                    : t("validation.username"),
                }))
              }
              onChange={(value) => {
                setUsername(value);
                setPassword("");
                setCaptcha(undefined);
                setCaptchaPoints([]);
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
            <Label htmlFor="signin-password">
              {t("auth.password")} <span className="text-error-500">*</span>
            </Label>
            <Input
              autoComplete="new-password"
              error={Boolean(fieldErrors.password)}
              hint={fieldErrors.password}
              id="signin-password"
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
          {captcha ? (
            <PointCaptcha
              captcha={captcha}
              onChange={(points) => {
                setCaptchaPoints(points);
                setFieldErrors((value) => ({ ...value, verification: "" }));
              }}
              onRefresh={async () =>
                setCaptcha(await refreshLoginCaptcha(captcha.captcha_id))
              }
              onVerify={async (points) => {
                const result = await verifyLoginCaptcha(
                  username.trim(),
                  captcha.captcha_id,
                  points,
                );
                if (result.captcha) setCaptcha(result.captcha);
                return result;
              }}
            />
          ) : (
            <SliderCaptcha
              onVerified={(proof) => {
                setSliderProof(proof);
                if (proof)
                  setFieldErrors((value) => ({ ...value, verification: "" }));
              }}
              purpose="login"
              resetKey={error}
              username={username}
            />
          )}
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
            {loading ? t("common.loading") : t("auth.signIn")}
          </Button>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {t("auth.noAccount")}{" "}
            <Link
              className="font-medium text-brand-500 hover:text-brand-600"
              to="/auth/register"
            >
              {t("auth.signUp")}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

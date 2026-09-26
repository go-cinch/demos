import { createSliderChallenge, verifySlider } from "@/api/auth";
import { ArrowRightIcon, CheckLineIcon } from "@/icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  purpose: "login" | "register";
  username: string;
  onVerified: (proof: string) => void;
  resetKey?: string;
}

export default function SliderCaptcha({
  purpose,
  username,
  onVerified,
  resetKey,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(0);
  const [status, setStatus] = useState<"idle" | "pending" | "passed" | "error">(
    "idle",
  );
  const challenge = useRef<
    ReturnType<typeof createSliderChallenge> | undefined
  >(undefined);
  const startedAt = useRef(0);
  const tracks = useRef<Array<{ t: number; x: number }>>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const width = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    setValue(0);
    setStatus("idle");
    onVerified("");
  }, [purpose, resetKey, username]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    setStatus("idle");
    onVerified("");
    startedAt.current = performance.now();
    width.current = Math.max(
      0,
      (rootRef.current?.clientWidth || 0) -
        (handleRef.current?.offsetWidth || 0) -
        6,
    );
    tracks.current = [{ t: 0, x: 0 }];
    challenge.current = createSliderChallenge(purpose, username);
    void challenge.current.catch(() => undefined);
  };

  const move = (nextValue: number) => {
    setValue(nextValue);
    if (startedAt.current && tracks.current.length < 128) {
      tracks.current.push({
        t: Math.round(performance.now() - startedAt.current),
        x: Math.round((nextValue / 100) * width.current),
      });
    }
  };

  const pointerValue = (clientX: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    const handleWidth = handleRef.current?.offsetWidth || 0;
    if (!bounds || width.current <= 0) return 0;
    return Math.min(
      100,
      Math.max(
        0,
        ((clientX - bounds.left - handleWidth / 2) / width.current) * 100,
      ),
    );
  };

  const finish = async (finalValue = value) => {
    if (finalValue < 99 || !challenge.current || !username.trim()) {
      setStatus("error");
      setValue(0);
      return;
    }
    setStatus("pending");
    const duration = Math.max(
      1,
      Math.round(performance.now() - startedAt.current),
    );
    const normalized = tracks.current.slice(0, 127).map(({ t: time, x }) => ({
      t: time,
      x: Math.min(width.current, Math.max(0, x)),
    }));
    normalized.push({ t: duration, x: width.current });
    try {
      const currentChallenge = await challenge.current;
      const result = await verifySlider({
        captcha_id: currentChallenge.captcha_id,
        distance: width.current,
        duration_ms: duration,
        purpose,
        tracks: normalized,
        username: username.trim(),
        width: width.current,
      });
      setStatus("passed");
      onVerified(result.proof);
    } catch {
      setStatus("error");
      setValue(0);
      onVerified("");
    } finally {
      challenge.current = undefined;
    }
  };

  return (
    <div>
      <div
        className={`relative h-12 overflow-hidden rounded-lg border transition-colors ${status === "passed" ? "border-success-500 bg-success-50 dark:bg-success-500/10" : status === "error" ? "border-error-500 bg-error-50 dark:bg-error-500/10" : "border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"}`}
        ref={rootRef}
      >
        <span
          className={`absolute inset-y-0 start-0 transition-colors ${status === "passed" ? "bg-success-500/15" : "bg-brand-500/10"}`}
          style={{ width: `${value}%` }}
        />
        <p
          className={`pointer-events-none absolute inset-0 flex items-center justify-center ps-12 pe-3 text-sm font-medium ${status === "passed" ? "text-success-700 dark:text-success-300" : "text-gray-500 dark:text-gray-400"}`}
        >
          {status === "passed"
            ? t("auth.sliderPassed")
            : status === "pending"
              ? t("common.verifying")
              : t("auth.sliderHint")}
        </p>
        <span
          className={`pointer-events-none absolute top-1 flex size-10 items-center justify-center rounded-md text-white shadow-theme-sm transition-colors ${status === "passed" ? "bg-success-500" : status === "error" ? "bg-error-500" : "bg-brand-500"}`}
          ref={handleRef}
          style={{
            insetInlineStart: `${value}%`,
            transform: `translateX(-${value}%)`,
          }}
        >
          {status === "passed" ? (
            <CheckLineIcon className="size-5" />
          ) : (
            <ArrowRightIcon className="size-5 rtl:rotate-180" />
          )}
        </span>
        <input
          aria-label={t("auth.slider")}
          className="absolute inset-0 z-10 size-full cursor-grab opacity-0 disabled:cursor-not-allowed"
          disabled={
            status === "pending" || status === "passed" || !username.trim()
          }
          max="100"
          min="0"
          name="captcha-action"
          onChange={(event) => move(Number(event.target.value))}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
            start();
            move(pointerValue(event.clientX));
          }}
          onPointerMove={(event) => {
            if (dragging.current) move(pointerValue(event.clientX));
          }}
          onPointerUp={(event) => {
            const finalValue = pointerValue(event.clientX);
            dragging.current = false;
            move(finalValue);
            void finish(finalValue);
          }}
          type="range"
          value={value}
        />
      </div>
      {status === "error" && (
        <p className="mt-1 text-sm text-error-500" role="alert">
          {t("auth.sliderFailed")}
        </p>
      )}
    </div>
  );
}

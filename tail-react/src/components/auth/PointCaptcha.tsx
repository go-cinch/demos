import type { CaptchaPoint, PointCaptchaChallenge } from "@/api/auth";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  captcha: PointCaptchaChallenge;
  onRefresh: () => Promise<void>;
  onVerify: (points: CaptchaPoint[]) => Promise<{ verified: boolean }>;
  onChange: (points: CaptchaPoint[]) => void;
}

export default function PointCaptcha({ captcha, onRefresh, onVerify, onChange }: Props) {
  const { t } = useTranslation();
  const imageRef = useRef<HTMLImageElement>(null);
  const [points, setPoints] = useState<CaptchaPoint[]>([]);
  const [status, setStatus] = useState<"idle" | "pending" | "passed" | "error">("idle");

  useEffect(() => {
    setPoints([]);
    setStatus("idle");
    onChange([]);
  }, [captcha.captcha_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (event: React.MouseEvent<HTMLImageElement>) => {
    if (status === "pending" || status === "passed") return;
    const bounds = imageRef.current!.getBoundingClientRect();
    const point = {
      x: Math.round(((event.clientX - bounds.left) / bounds.width) * captcha.width),
      y: Math.round(((event.clientY - bounds.top) / bounds.height) * captcha.height),
    };
    const next = [...points, point].slice(0, captcha.target_count);
    setPoints(next);
    if (next.length !== captcha.target_count) return;
    setStatus("pending");
    try {
      const result = await onVerify(next);
      if (result.verified) {
        setStatus("passed");
        onChange(next);
      } else {
        setStatus("error");
        setPoints([]);
        onChange([]);
      }
    } catch {
      setStatus("error");
      setPoints([]);
      onChange([]);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{captcha.hint_text || t("auth.pointHint")}</span>
        <button type="button" className="font-medium text-brand-500" onClick={() => void onRefresh()}>{t("common.refresh")}</button>
      </div>
      <div className="relative overflow-hidden rounded-lg">
        <img ref={imageRef} alt={t("auth.pointCaptcha")} className="h-auto w-full cursor-crosshair" onClick={(event) => void choose(event)} src={captcha.captcha_image} />
        {points.map((point, index) => (
          <span key={`${point.x}-${point.y}-${index}`} className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-theme-md" style={{ left: `${(point.x / captcha.width) * 100}%`, top: `${(point.y / captcha.height) * 100}%` }}>{index + 1}</span>
        ))}
      </div>
      <p className={`mt-2 text-xs ${status === "error" ? "text-error-500" : status === "passed" ? "text-success-500" : "text-gray-500"}`}>
        {status === "pending" ? t("common.verifying") : status === "passed" ? t("auth.pointPassed") : status === "error" ? t("auth.pointFailed") : t("auth.pointProgress", { count: captcha.target_count })}
      </p>
    </div>
  );
}

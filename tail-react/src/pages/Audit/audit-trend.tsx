import { lazy, Suspense, useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import type { AuditSummary } from "@/utils/admin/model";
import { adminDate } from "@/utils/admin/model";
const Chart = lazy(() => import("react-apexcharts"));
function readPalette() {
  const fallback = {
    primary: "#465fff",
    failure: "#f04438",
    dark: false,
    grid: "#e4e7ec",
    text: "#475467",
    font: "Outfit, sans-serif",
  };
  if (typeof document === "undefined") return fallback;
  const root = document.documentElement,
    style = getComputedStyle(root);
  const dark = root.classList.contains("dark");
  return {
    primary:
      style.getPropertyValue("--color-brand-500").trim() || fallback.primary,
    failure:
      style.getPropertyValue("--color-error-500").trim() || fallback.failure,
    dark,
    grid:
      style
        .getPropertyValue(dark ? "--color-gray-800" : "--color-gray-200")
        .trim() || fallback.grid,
    text:
      style
        .getPropertyValue(dark ? "--color-gray-400" : "--color-gray-600")
        .trim() || fallback.text,
    font: getComputedStyle(document.body).fontFamily || fallback.font,
  };
}

export default function AuditTrend({
  summary,
  result,
  timezone,
  text,
  onScope,
}: {
  summary?: AuditSummary;
  result: string;
  timezone: string;
  text: (key: string) => string;
  onScope: (from: number, to: number) => void;
}) {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const update = () =>
      setPalette((previous) => {
        const next = readPalette();
        return Object.keys(next).every(
          (key) =>
            next[key as keyof typeof next] ===
            previous[key as keyof typeof previous],
        )
          ? previous
          : next;
      });
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-accent"],
    });
    const frame = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const points = summary?.trend ?? [];
  const options: ApexOptions = {
    chart: {
      type: "area",
      background: "transparent",
      foreColor: palette.text,
      fontFamily: palette.font,
      toolbar: { show: true },
      zoom: { enabled: true, type: "x" },
      events: {
        dataPointSelection: (
          _event,
          _context,
          config?: { dataPointIndex?: number },
        ) => {
          const point = points[config?.dataPointIndex ?? -1];
          if (point)
            onScope(point.at, point.at + (summary?.bucket_ms ?? 3600000));
        },
        zoomed: (
          _context,
          { xaxis }: { xaxis: { min: number; max: number } },
        ) => onScope(xaxis.min, xaxis.max),
      },
    },
    colors:
      result === "failure"
        ? [palette.failure]
        : [palette.primary, palette.failure],
    theme: { mode: palette.dark ? "dark" : "light" },
    grid: { borderColor: palette.grid },
    stroke: { curve: "smooth", width: 2 },
    fill: { opacity: 0.15 },
    dataLabels: { enabled: false },
    xaxis: {
      type: "datetime",
      labels: {
        formatter: (_value, timestamp) =>
          adminDate(timestamp, timezone).slice(5, 16),
      },
    },
    yaxis: { min: 0, decimalsInFloat: 0 },
    tooltip: { x: { formatter: (value) => adminDate(value, timezone) } },
    legend: { show: true },
  };
  const series = [
    ...(result !== "failure"
      ? [
          {
            name: text("audit.success"),
            data: points.map((point) => ({ x: point.at, y: point.success })),
          },
        ]
      : []),
    ...(result !== "success"
      ? [
          {
            name: text("audit.failure"),
            data: points.map((point) => ({ x: point.at, y: point.failure })),
          },
        ]
      : []),
  ];
  return (
    <div className="h-64" data-testid="audit-trend">
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        }
      >
        <Chart type="area" height={256} options={options} series={series} />
      </Suspense>
    </div>
  );
}

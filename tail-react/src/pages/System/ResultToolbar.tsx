import { useTranslation } from "react-i18next";
import Checkbox from "@/components/form/input/Checkbox";
import Switch from "@/components/form/switch/Switch";
import { AspectIcon, ListIcon, RegenerateIcon, SettingsAltIcon } from "@/icons";
import type { Dispatch, SetStateAction } from "react";
export type Density = "compact" | "default" | "loose";
export type TableSettings = {
  bordered: boolean;
  striped: boolean;
  sticky: boolean;
};
const buttonClass =
  "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition";
export default function ResultToolbar({
  refresh,
  density,
  setDensity,
  fullscreen,
  toggleFullscreen,
  columns,
  visible,
  setVisible,
  settings,
  setSettings,
}: {
  refresh: () => void;
  density: Density;
  setDensity: (v: Density) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  columns: { key: string; label: string }[];
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  settings: TableSettings;
  setSettings: Dispatch<SetStateAction<TableSettings>>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        aria-label={t("common.refresh")}
        className={`${buttonClass} border border-gray-300 dark:border-gray-700`}
        onClick={() => refresh()}
        title={t("common.refresh")}
      >
        <RegenerateIcon className="size-4" />
      </button>
      <details className="relative">
        <summary
          className={`${buttonClass} cursor-pointer list-none border border-gray-300 dark:border-gray-700`}
          aria-label={t("table.density")}
          role="button"
        >
          <ListIcon className="size-4" />
        </summary>
        <div className="absolute end-0 z-40 mt-2 w-36 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          {(["compact", "default", "loose"] as const).map((item) => (
            <button
              className={`block w-full rounded-lg px-3 py-2 text-start text-sm ${density === item ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "hover:bg-gray-100 dark:hover:bg-white/5"}`}
              key={item}
              onClick={() => setDensity(item)}
              type="button"
            >
              {t(`table.${item}`)}
            </button>
          ))}
        </div>
      </details>
      <button
        aria-label={t(fullscreen ? "table.exitFullscreen" : "table.fullscreen")}
        className={`${buttonClass} border border-gray-300 dark:border-gray-700`}
        onClick={() => toggleFullscreen()}
        title={t(fullscreen ? "table.exitFullscreen" : "table.fullscreen")}
      >
        <AspectIcon className="size-4" />
      </button>
      <details className="relative">
        <summary
          className={`${buttonClass} cursor-pointer list-none border border-gray-300 dark:border-gray-700`}
          aria-label={t("table.columns")}
          role="button"
        >
          <ListIcon className="size-4" />
        </summary>
        <div className="absolute end-0 z-40 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-2 text-sm font-semibold">
            {t("table.visibleColumns")}
          </p>
          {columns.map((column) => (
            <label
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
              key={column.key}
            >
              <Checkbox
                checked={visible.includes(column.key)}
                onChange={() =>
                  setVisible((current) =>
                    current.includes(column.key)
                      ? current.filter((key) => key !== column.key)
                      : [...current, column.key],
                  )
                }
              />
              {t(column.label)}
            </label>
          ))}
        </div>
      </details>
      <details className="relative">
        <summary
          className={`${buttonClass} cursor-pointer list-none border border-gray-300 dark:border-gray-700`}
          aria-label={t("table.style")}
          role="button"
        >
          <SettingsAltIcon className="size-4" />
        </summary>
        <div className="absolute end-0 z-40 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          {(["bordered", "striped", "sticky"] as const).map((setting) => (
            <label
              className="flex items-center justify-between gap-3 py-2 text-sm"
              key={setting}
            >
              {t(`table.${setting}`)}
              <Switch
                checked={settings[setting]}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    [setting]: checked,
                  }))
                }
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

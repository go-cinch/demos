import { cn } from "@/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const ChartTab: React.FC = () => {
  const { t } = useTranslation("common", { keyPrefix: "ecommerce.statistics" });
  const [selected, setSelected] = useState<
    "optionOne" | "optionTwo" | "optionThree"
  >("optionOne");

  const getButtonClass = (option: "optionOne" | "optionTwo" | "optionThree") =>
    selected === option
      ? "shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      <button
        onClick={() => setSelected("optionOne")}
        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-theme-sm font-medium hover:text-gray-900 dark:hover:text-white ${getButtonClass(
          "optionOne",
        )}`}
      >
        {t("monthly")}
      </button>

      <button
        onClick={() => setSelected("optionTwo")}
        className={cn(
          "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-theme-sm font-medium hover:text-gray-900 rtl:min-w-23 dark:hover:text-white",
          getButtonClass("optionTwo"),
        )}
      >
        {t("quarterly")}
      </button>

      <button
        onClick={() => setSelected("optionThree")}
        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-theme-sm font-medium hover:text-gray-900 dark:hover:text-white ${getButtonClass(
          "optionThree",
        )}`}
      >
        {t("annually")}
      </button>
    </div>
  );
};

export default ChartTab;

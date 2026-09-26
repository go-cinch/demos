import { useState } from "react";

interface SwitchProps {
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  color?: "blue" | "gray";
}

const Switch: React.FC<SwitchProps> = ({
  label,
  checked,
  defaultChecked = false,
  disabled = false,
  onChange,
  color = "blue",
}) => {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked ?? internalChecked;
  const handleToggle = () => {
    if (disabled) return;
    const next = !isChecked;
    if (checked === undefined) setInternalChecked(next);
    onChange?.(next);
  };
  const background = isChecked
    ? color === "blue"
      ? "bg-brand-500"
      : "bg-gray-800 dark:bg-white/20"
    : "bg-gray-200 dark:bg-white/10";

  return (
    <label
      className={`flex items-center gap-3 text-sm font-medium select-none ${disabled ? "text-gray-400" : "text-gray-700 dark:text-gray-400"}`}
    >
      <button
        aria-checked={isChecked}
        className={`relative h-6 w-11 rounded-full transition ${background} disabled:cursor-not-allowed disabled:opacity-50`}
        disabled={disabled}
        onClick={handleToggle}
        role="switch"
        type="button"
      >
        <span
          className={`absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${isChecked ? "translate-x-full rtl:-translate-x-full" : "translate-x-0"}`}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
};

export default Switch;

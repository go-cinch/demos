import { ChevronDownIcon } from "@/icons";
import { useEffect, useId, useRef, useState } from "react";

interface Option {
  label: string;
  value: number | string;
}

interface Props {
  ariaLabel?: string;
  className?: string;
  id?: string;
  name?: string;
  onChange: (value: number | string) => void;
  options: Option[];
  placeholder?: string;
  value: number | string;
}

export default function SimpleSelect({
  ariaLabel,
  className = "",
  id,
  name,
  onChange,
  options,
  placeholder,
  value,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find(
    (option) => String(option.value) === String(value),
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white py-2.5 ps-4 pe-3 text-start text-sm text-gray-800 shadow-theme-xs transition hover:border-brand-300 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        id={id}
        name={name}
        onClick={() => setOpen((current) => !current)}
        role="combobox"
        type="button"
      >
        <span className={selected ? "truncate" : "truncate text-gray-400"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className="absolute z-60 mt-1 max-h-60 w-full min-w-36 overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900"
          id={listboxId}
          role="listbox"
        >
          {options.map((option) => (
            <button
              aria-selected={String(option.value) === String(value)}
              className={`block w-full rounded-lg px-3 py-2 text-start text-sm ${String(option.value) === String(value) ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}
              key={String(option.value)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

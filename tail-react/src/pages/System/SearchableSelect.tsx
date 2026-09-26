import { CloseLineIcon, SearchIcon } from "@/icons";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface SearchableOption {
  label: string;
  value: number | string;
}

interface Props {
  allowCustom?: boolean;
  id: string;
  initialOptions?: SearchableOption[];
  multiple?: boolean;
  name: string;
  onChange: (
    value: number | string | Array<number | string> | undefined,
  ) => void;
  onSearch: (query: string) => Promise<SearchableOption[]>;
  value: unknown;
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent ps-4 pe-10 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const emptyOptions: SearchableOption[] = [];

export default function SearchableSelect({
  allowCustom = false,
  id,
  initialOptions = emptyOptions,
  multiple = false,
  name,
  onChange,
  onSearch,
  value,
}: Props) {
  const { t } = useTranslation();
  const listboxId = useId();
  const requestId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(onSearch);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<SearchableOption[]>(initialOptions);
  const selectedValues = useMemo(
    () =>
      multiple
        ? ((Array.isArray(value) ? value : []) as Array<number | string>)
        : value === undefined || value === null || value === ""
          ? []
          : [value as number | string],
    [multiple, value],
  );
  const knownOptions = useMemo(
    () =>
      new Map(
        [...initialOptions, ...options].map((option) => [
          String(option.value),
          option,
        ]),
      ),
    [initialOptions, options],
  );
  const selectionRef = useRef({ knownOptions, selectedValues });

  useEffect(() => {
    searchRef.current = onSearch;
  }, [onSearch]);
  useEffect(() => {
    selectionRef.current = { knownOptions, selectedValues };
  }, [knownOptions, selectedValues]);

  useEffect(() => {
    if (!open) return;
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchRef.current(query.trim());
        if (currentRequest !== requestId.current) return;
        const merged = new Map<string, SearchableOption>();
        for (const selected of selectionRef.current.selectedValues) {
          const option = selectionRef.current.knownOptions.get(
            String(selected),
          );
          if (option) merged.set(String(option.value), option);
        }
        for (const option of results) merged.set(String(option.value), option);
        setOptions([...merged.values()]);
      } catch {
        if (currentRequest !== requestId.current) return;
        setOptions(
          [...selectionRef.current.knownOptions.values()].filter((option) =>
            selectionRef.current.selectedValues.some(
              (selected) => String(selected) === String(option.value),
            ),
          ),
        );
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (option: SearchableOption) => {
    if (multiple) {
      if (
        !selectedValues.some(
          (selected) => String(selected) === String(option.value),
        )
      ) {
        onChange([...selectedValues, option.value]);
      }
      setQuery("");
    } else {
      onChange(option.value);
      setQuery("");
      setOpen(false);
    }
    setOptions((current) =>
      current.some((item) => String(item.value) === String(option.value))
        ? current
        : [...current, option],
    );
  };

  const remove = (selected: number | string) => {
    if (multiple)
      onChange(
        selectedValues.filter((item) => String(item) !== String(selected)),
      );
    else onChange(undefined);
  };

  const normalizedQuery = query.trim();
  const visibleOptions = options.filter(
    (option) =>
      !selectedValues.some(
        (selected) => String(selected) === String(option.value),
      ),
  );
  const customOption =
    allowCustom &&
    normalizedQuery &&
    !options.some(
      (option) =>
        String(option.value).toLowerCase() === normalizedQuery.toLowerCase(),
    )
      ? { label: normalizedQuery, value: normalizedQuery }
      : undefined;

  return (
    <div className="relative" ref={rootRef}>
      {selectedValues.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedValues.map((selected) => {
            const option = knownOptions.get(String(selected));
            return (
              <span
                className="inline-flex max-w-full items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                key={String(selected)}
              >
                <span className="truncate">
                  {option?.label || String(selected)}
                </span>
                <button
                  aria-label={t("select.remove", {
                    value: option?.label || String(selected),
                  })}
                  className="shrink-0 rounded p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/20"
                  onClick={() => remove(selected)}
                  type="button"
                >
                  <CloseLineIcon className="size-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute end-3 top-3 size-5 text-gray-400" />
        <input
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          autoComplete="off"
          className={inputClass}
          id={id}
          name={name}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              return;
            }
            if (event.key === "Enter" && customOption) {
              event.preventDefault();
              choose(customOption);
            }
          }}
          placeholder={t(
            multiple ? "select.searchMultiple" : "select.searchSingle",
          )}
          role="combobox"
          value={query}
        />
        {!multiple && selectedValues.length > 0 && (
          <button
            aria-label={t("select.clear")}
            className="absolute end-3 top-3 rounded text-gray-400 hover:text-error-500"
            onClick={() => remove(selectedValues[0])}
            type="button"
          >
            <CloseLineIcon className="size-5" />
          </button>
        )}
      </div>
      {open && (
        <div
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900"
          id={listboxId}
          role="listbox"
          aria-multiselectable={multiple || undefined}
        >
          {loading && (
            <p className="px-3 py-2 text-sm text-gray-500">
              {t("common.loading")}
            </p>
          )}
          {!loading && customOption && (
            <button
              className="block w-full rounded-lg px-3 py-2 text-start text-sm text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              onClick={() => choose(customOption)}
              role="option"
              type="button"
            >
              {t("select.create", { value: customOption.label })}
            </button>
          )}
          {!loading &&
            visibleOptions.map((option) => (
              <button
                aria-selected="false"
                className="block w-full rounded-lg px-3 py-2 text-start text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                key={String(option.value)}
                onClick={() => choose(option)}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            ))}
          {!loading && !customOption && visibleOptions.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">
              {t("select.empty")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

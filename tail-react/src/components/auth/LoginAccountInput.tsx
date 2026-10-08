import Input from "@/components/form/input/InputField";
import { CloseLineIcon } from "@/icons";
import {
  readLoginAccountHistory,
  writeLoginAccountHistory,
} from "@/utils/loginAccountHistory";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

interface LoginAccountInputProps {
  error?: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: string;
}

export default function LoginAccountInput({
  error,
  onBlur,
  onChange,
  value,
}: LoginAccountInputProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState(readLoginAccountHistory);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const showHistory = open && history.length > 0;
  const query = value.trim().toLowerCase();
  const options = history.filter((item) => item.toLowerCase().includes(query));
  useEffect(() => {
    if (open && activeIndex >= 0)
      document
        .getElementById(`login-account-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);
  const select = (account: string) => {
    onChange(account);
    setOpen(false);
    setActiveIndex(-1);
  };
  const updateHistory = (accounts: string[]) => {
    setHistory(writeLoginAccountHistory(accounts));
    setActiveIndex(-1);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (options.length)
        setActiveIndex((index) =>
          event.key === "ArrowDown"
            ? (index + 1) % options.length
            : index <= 0
              ? options.length - 1
              : index - 1,
        );
    } else if (event.key === "Enter" && open && options[activeIndex]) {
      event.preventDefault();
      select(options[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
          onBlur();
        }
      }}
    >
      <Input
        id="signin-username"
        name="username"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showHistory}
        aria-controls={showHistory ? "login-account-options" : undefined}
        aria-activedescendant={
          showHistory && options[activeIndex]
            ? `login-account-option-${activeIndex}`
            : undefined
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "signin-username-error" : undefined}
        error={Boolean(error)}
        placeholder={t("auth.username")}
        value={value}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {showHistory && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <p className="text-xs font-medium text-gray-400">
              {t("auth.accountHistory")}
            </p>
            {history.length > 0 && (
              <button
                className="rounded px-1 text-xs text-gray-500 hover:text-error-500 dark:text-gray-400"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => updateHistory([])}
              >
                {t("auth.clearAccountHistory")}
              </button>
            )}
          </div>
          <div
            id="login-account-options"
            role="listbox"
            aria-label={t("auth.accountHistory")}
          >
            {options.map((item, index) => (
              <div
                id={`login-account-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                key={item}
                className={`flex items-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 ${index === activeIndex ? "bg-gray-100 dark:bg-white/5" : ""}`}
              >
                <button
                  className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-start text-sm text-gray-700 dark:text-gray-300"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(item)}
                >
                  <Highlighted value={item} query={query} />
                </button>
                <button
                  aria-label={t("auth.removeAccountHistory", { value: item })}
                  className="me-1 rounded p-1 text-gray-400 hover:text-error-500"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    updateHistory(history.filter((account) => account !== item))
                  }
                >
                  <CloseLineIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
          {options.length === 0 && (
            <p
              role="status"
              className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400"
            >
              {t("auth.noMatchingAccounts")}
            </p>
          )}
        </div>
      )}
      {error && (
        <p
          id="signin-username-error"
          role="alert"
          className="mt-1.5 text-xs text-error-500"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function Highlighted({ query, value }: { query: string; value: string }) {
  const index = value.toLowerCase().indexOf(query);
  if (!query || index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="bg-transparent font-semibold text-error-500">
        {value.slice(index, index + query.length)}
      </mark>
      {value.slice(index + query.length)}
    </>
  );
}

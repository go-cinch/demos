import { useEffect, useState } from "react";
export default function RequestFeedback() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function show(event: Event) {
      setMessage((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 5000);
    }
    window.addEventListener("cinch-request-error", show);
    return () => {
      window.removeEventListener("cinch-request-error", show);
      clearTimeout(timer);
    };
  }, []);
  return message ? (
    <div
      role="alert"
      className="fixed start-1/2 top-5 z-999999 -translate-x-1/2 rounded-lg border border-error-300 bg-white px-5 py-3 text-sm text-error-600 shadow-theme-lg dark:border-error-700 dark:bg-gray-900 dark:text-error-400"
    >
      {message}
    </div>
  ) : null;
}

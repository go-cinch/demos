import i18n from "@/i18n";
export function gatewayMessage() {
  return i18n.t("errors.serverLost");
}
const recent = new Map<string, number>();
export function notifyRequestFailure(message: string) {
  const now = performance.now();
  for (const [key, time] of recent) if (now - time >= 500) recent.delete(key);
  if (recent.has(message)) return;
  recent.set(message, now);
  window.dispatchEvent(
    new CustomEvent("cinch-request-error", { detail: message }),
  );
}
export function isBadGatewayError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 502,
  );
}

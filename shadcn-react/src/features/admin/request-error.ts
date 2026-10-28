import english from './en.json';
import chinese from './zh.json';
import { toast } from 'sonner';
export function gatewayMessage() {
  return (localStorage.getItem('go-cinch-locale') === 'zh-CN' ? chinese : english).errors
    .serverLost;
}
const recent = new Map<string, number>();
export function notifyRequestFailure(message: string) {
  const now = performance.now();
  for (const [key, time] of recent) if (now - time >= 500) recent.delete(key);
  if (recent.has(message)) return;
  recent.set(message, now);
  toast.error(message, { id: `cinch-request-${message}` });
}
export function isBadGatewayError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'status' in error && error.status === 502);
}

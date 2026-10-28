import { ElMessage } from 'element-plus'
import { $t } from '@/locales'
export function gatewayMessage() {
  return $t('auth.serverLost')
}
const recent = new Map<string, number>()
export function notifyRequestFailure(message: string) {
  const now = performance.now()
  for (const [key, time] of recent) if (now - time >= 500) recent.delete(key)
  if (recent.has(message)) return
  recent.set(message, now)
  ElMessage.error(message)
}
export function isBadGatewayError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'response' in error &&
      (error.response as { status?: number })?.status === 502
  )
}

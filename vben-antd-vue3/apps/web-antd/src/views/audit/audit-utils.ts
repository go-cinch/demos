import type { AuditEvent } from '#/api/audit';
import { $t } from '#/locales';
export function successful(event: Partial<Pick<AuditEvent, 'status'>>) {
  return (event.status ?? 0) >= 200 && (event.status ?? 0) < 400;
}
export function operationLabel(event: Partial<Pick<AuditEvent, 'method' | 'module'>>) {
  const key =
    event.method === 'POST'
      ? 'create'
      : event.method === 'DELETE'
      ? 'remove'
      : 'update';
  if (event.module === 'auth') return $t('audit.modules.auth');
  return $t(`audit.actions.${key}`, {
    module: $t(`audit.modules.${event.module}`),
  });
}
export function clientLabel(agent = '') {
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
    ? 'Firefox'
    : /Chrome\//.test(agent)
    ? 'Chrome'
    : /Safari\//.test(agent)
    ? 'Safari'
    : '';
  const os = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad/.test(agent)
    ? 'iOS'
    : /Windows/.test(agent)
    ? 'Windows'
    : /Macintosh|Mac OS/.test(agent)
    ? 'macOS'
    : /Linux/.test(agent)
    ? 'Linux'
    : '';
  return [browser, os].filter(Boolean).join(' / ') || $t('audit.otherClient');
}

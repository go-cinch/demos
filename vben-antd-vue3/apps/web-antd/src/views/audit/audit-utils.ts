import type { AuditEvent, AuditOutcome } from '#/api/audit';

import { $t } from '#/locales';

export function successful(event: Partial<Pick<AuditEvent, 'status'>>) {
  return (event.status ?? 0) >= 200 && (event.status ?? 0) < 400;
}
export function auditOutcome(
  event: Partial<Pick<AuditEvent, 'outcome' | 'status'>>,
): AuditOutcome {
  return event.outcome ?? (successful(event) ? 'success' : 'failure');
}

export const outcomeColor = {
  success: 'success',
  failure: 'error',
  mfa_challenge: 'warning',
};

export function operationLabel(
  event: Partial<Pick<AuditEvent, 'method' | 'module' | 'operation'>>,
) {
  let key = 'update';
  if (event.method === 'POST') {
    key = 'create';
  } else if (event.method === 'DELETE') {
    key = 'remove';
  }
  if (event.module === 'auth') {
    return event.operation
      ? $t(`audit.operationTypes.${event.operation}`)
      : $t('audit.modules.auth');
  }
  return $t(`audit.actions.${key}`, {
    module: $t(`audit.modules.${event.module}`),
  });
}
export function clientLabel(agent = '') {
  let browser = '';
  if (/Edg\//.test(agent)) {
    browser = 'Edge';
  } else if (/Firefox\//.test(agent)) {
    browser = 'Firefox';
  } else if (/Chrome\//.test(agent)) {
    browser = 'Chrome';
  } else if (/Safari\//.test(agent)) {
    browser = 'Safari';
  }
  let os = '';
  if (/Android/.test(agent)) {
    os = 'Android';
  } else if (/iPhone|iPad/.test(agent)) {
    os = 'iOS';
  } else if (/Windows/.test(agent)) {
    os = 'Windows';
  } else if (/Macintosh|Mac OS/.test(agent)) {
    os = 'macOS';
  } else if (/Linux/.test(agent)) {
    os = 'Linux';
  }
  return [browser, os].filter(Boolean).join(' / ') || $t('audit.otherClient');
}

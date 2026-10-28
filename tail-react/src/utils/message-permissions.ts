interface MessageAccess {
  canMenu: (path: string) => boolean;
  canButton: (key: string) => boolean;
}

/** Page entry and individual message controls are independent catalog grants. */
export function messagePermissions(access: MessageAccess, sent = false) {
  const prefix = sent ? 'system:msg' : 'msg:inbox';
  const canControl = (control: string) => access.canButton(`admin:btn:${prefix}:${control}`);
  return {
    canRead: access.canMenu(sent ? '/system/msg' : '/msg/inbox'),
    canControl,
    canSend: sent && canControl('send'),
    canDelete: canControl('delete'),
  };
}

/** Opening a detail never implies the separate mark-read capability. */
export function canAutoMarkMessageRead(access: MessageAccess, sent: boolean, readAt: number | null | undefined) {
  const permissions = messagePermissions(access, sent);
  return !sent && !readAt && permissions.canRead && permissions.canControl('mark-read');
}

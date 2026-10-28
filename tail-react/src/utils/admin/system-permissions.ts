interface SystemAccess {
  canMenu: (path: string) => boolean;
  canButton: (key: string) => boolean;
  user?: { permission: { permission_scope?: '*'; permission_scopes?: string[] } } | null;
}
/** A page entry grants loading; each catalog control remains independent. */
export function canSystemControl(access: SystemAccess, resource: string, control: string) {
  if (!access.canMenu(`/system/${resource}`) || !access.canButton(`admin:btn:system:${resource}:${control}`)) return false;
  const operation = ({ create: 'create', edit: 'update', delete: 'delete', 'delete-selected': 'delete' } as Record<string, string>)[control];
  return resource !== 'action' || !operation || access.user?.permission.permission_scope === '*' || !!access.user?.permission.permission_scopes?.includes(`action:${operation}`);
}

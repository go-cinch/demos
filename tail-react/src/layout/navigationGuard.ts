const guards = new Map<string, () => Promise<boolean>>();
export function registerCloseGuard(path: string, guard: () => Promise<boolean>) {
  guards.set(path, guard);
  return () => { guards.delete(path); };
}
export async function canCloseTab(path: string) { return (await guards.get(path)?.()) ?? true; }

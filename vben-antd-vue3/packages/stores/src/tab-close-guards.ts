type TabCloseGuard = () => boolean | Promise<boolean>;

const guards = new Map<string, TabCloseGuard>();

export function registerTabCloseGuard(path: string, guard: TabCloseGuard) {
  guards.set(path, guard);
  return () => {
    if (guards.get(path) === guard) guards.delete(path);
  };
}

export async function canCloseTabPaths(paths: string[]) {
  for (const path of new Set(paths)) {
    const guard = guards.get(path);
    if (guard && !(await guard())) return false;
  }
  return true;
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown) {
  try {
    value === undefined
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may disable persistent storage. */
  }
}
const rememberedKey = () => `go-cinch-remembered:${location.hostname}`;
export function rememberedCredentials(): { username: string; password: string } | null {
  const value = readStored<{ username: string; password: string } | null>(rememberedKey(), null);
  return value && typeof value.username === 'string' && typeof value.password === 'string'
    ? value
    : null;
}
export function rememberCredentials(username: string, password: string, enabled = true) {
  writeStored(rememberedKey(), enabled ? { username, password } : undefined);
}

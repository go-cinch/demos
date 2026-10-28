/** Call after detail hydration so the callback observes the latest grants. */
export async function markMessageRead(
  message: { id: number; read_at: number | null },
  allowed: () => boolean,
  read: (id: number) => Promise<unknown>
): Promise<boolean> {
  if (message.read_at || !allowed()) return false
  await read(message.id)
  message.read_at = Date.now()
  return true
}

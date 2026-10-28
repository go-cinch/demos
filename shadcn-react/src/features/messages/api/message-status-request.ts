// Coalesce concurrent callers. A mutation invalidates the in-flight snapshot;
// every waiter then receives a request started after that mutation completed.
// Settled responses are not cached, so expiry and remote publications stay fresh.
export class MessageStatusRequest<T> {
  private revision = 0;
  private pending = new Map<unknown, Promise<T>>();

  invalidate(): void {
    this.revision++;
  }

  get(key: unknown, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.latest(load).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }

  private async latest(load: () => Promise<T>): Promise<T> {
    for (;;) {
      const revision = this.revision;
      try {
        const result = await load();
        if (revision === this.revision) return result;
      } catch (error) {
        if (revision === this.revision) throw error;
      }
    }
  }
}

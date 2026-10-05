import type { Msg, MsgPage } from './msg';

type FeedState = {
  rows: Msg[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string;
  moreError: string;
  hasMore: boolean;
};

// Keep loaded pages visible while polling or retrying a later page.
export class MessageFeed {
  private state: FeedState = {
    rows: [],
    total: 0,
    loading: true,
    loadingMore: false,
    refreshing: false,
    error: '',
    moreError: '',
    hasMore: false,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private page = 1;
  private refreshing = false;
  private active = true;

  constructor(
    private fetchPage: (page: number) => Promise<MsgPage>,
    private size: number,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  activate() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.generation++;
  }
  private update(value: Partial<FeedState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((listener) => listener());
  }
  setError = (error: string) => this.update({ error });
  load = async () => {
    if (!this.active) return;
    const current = ++this.generation;
    this.refreshing = true;
    this.update({
      loading: !this.state.rows.length,
      loadingMore: false,
      refreshing: true,
      error: '',
      moreError: '',
    });
    try {
      const first = await this.fetchPage(1);
      if (!this.active || current !== this.generation) return;
      const last = Math.max(1, Math.min(this.page, Math.ceil(first.t / this.size)));
      const rest = await Promise.all(
        Array.from({ length: last - 1 }, (_, index) => this.fetchPage(index + 2)),
      );
      if (!this.active || current !== this.generation) return;
      const rows = [
        ...new Map(
          [first, ...rest].flatMap((result) => result.items).map((row) => [row.id, row]),
        ).values(),
      ];
      this.page = last;
      this.update({
        rows,
        total: first.t,
        hasMore: last * this.size < first.t,
      });
    } catch (error) {
      if (this.active && current === this.generation) this.setError((error as Error).message);
    } finally {
      if (this.active && current === this.generation) {
        this.refreshing = false;
        this.update({ loading: false, refreshing: false });
      }
    }
  };
  loadMore = async () => {
    if (!this.active || this.refreshing || this.state.loadingMore || !this.state.hasMore) return;
    const current = this.generation,
      next = this.page + 1;
    this.update({ loadingMore: true, moreError: '' });
    try {
      const result = await this.fetchPage(next);
      if (!this.active || current !== this.generation) return;
      const rows = [
        ...new Map([...this.state.rows, ...result.items].map((row) => [row.id, row])).values(),
      ];
      this.page = next;
      this.update({
        rows,
        total: result.t,
        hasMore: !!result.items.length && next * this.size < result.t,
      });
    } catch (error) {
      if (this.active && current === this.generation)
        this.update({ moreError: (error as Error).message });
    } finally {
      if (this.active && current === this.generation) this.update({ loadingMore: false });
    }
  };
}

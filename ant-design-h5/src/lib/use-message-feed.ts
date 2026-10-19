import { useEffect, useMemo, useSyncExternalStore } from "react";
import { MessageFeed } from "./message-feed";
import { msgApi } from "./msg";

export function useMessageFeed(enabled: boolean, type: string, size: number) {
  const feed = useMemo(
    () =>
      new MessageFeed(
        (page) =>
          enabled
            ? msgApi.list(false, {
                p: page,
                s: size,
                ...(type ? { type } : {}),
              })
            : Promise.resolve({ items: [], t: 0, p: page, s: size }),
        size,
      ),
    [enabled, type, size],
  );
  useEffect(() => {
    feed.activate();
    return () => feed.dispose();
  }, [feed]);
  const state = useSyncExternalStore(feed.subscribe, feed.snapshot);
  return {
    ...state,
    load: feed.load,
    loadMore: feed.loadMore,
    setError: feed.setError,
  };
}

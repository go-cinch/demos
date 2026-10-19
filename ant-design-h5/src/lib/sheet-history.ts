// Keep same-URL overlay entries out of BrowserRouter's navigation stack.
// Queue cleanup before opening a replacement sheet to avoid async back races.
type Entry = { id: string; url: string; back: () => boolean; consumed: boolean };
const entries: Entry[] = [];
let queue = Promise.resolve();
let completing: (() => void) | undefined;
const marker = 'cinchSheet';
window.addEventListener(
  'popstate',
  (event) => {
    if (completing) {
      event.stopImmediatePropagation();
      const done = completing;
      completing = undefined;
      done();
      return;
    }
    const entry = entries.at(-1);
    if (!entry || history.state?.[marker] === entry.id || location.href !== entry.url) return;
    event.stopImmediatePropagation();
    if (entry.back()) entry.consumed = true;
    else history.pushState({ ...history.state, [marker]: entry.id }, '', entry.url);
  },
  true,
);

export function registerSheet(id: string, back: () => boolean) {
  const token = `${id}:${crypto.randomUUID()}`;
  const entry: Entry = { id: token, back, url: location.href, consumed: false };
  let disposed = false;
  queue = queue.then(() => {
    if (disposed) return;
    entries.push(entry);
    history.pushState({ ...history.state, [marker]: token }, '', entry.url);
  });
  return () => {
    disposed = true;
    queue = queue.then(async () => {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
      if (!entry.consumed && history.state?.[marker] === token && location.href === entry.url) {
        await new Promise<void>((resolve) => {
          completing = resolve;
          history.back();
        });
      }
    });
  };
}

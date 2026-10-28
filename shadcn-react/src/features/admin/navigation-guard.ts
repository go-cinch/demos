export function guardedNavigate(path: string, proceed: () => void) {
  const event = new CustomEvent('go-cinch-before-navigate', {
    detail: { path, proceed }, cancelable: true
  });
  if (window.dispatchEvent(event)) proceed();
}

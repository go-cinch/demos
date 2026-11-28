type LoginTransition = () => Promise<void> | void;

let transition: { play: LoginTransition; timeoutMs: number } | undefined;

/** Only the mounted authentication illustration can delay navigation. */
export function registerLoginTransition(
  play: LoginTransition,
  timeoutMs: number,
) {
  const current = { play, timeoutMs };
  transition = current;
  return () => {
    if (transition === current) transition = undefined;
  };
}

export async function playLoginTransition() {
  const current = transition;
  if (!current) return;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const animation = current.play();
    if (!animation) return;
    await Promise.race([
      animation,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, current.timeoutMs);
      }),
    ]);
  } catch {
    // A decorative effect must never prevent a successful sign-in.
  } finally {
    clearTimeout(timeout);
  }
}

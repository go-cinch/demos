type LoginTransition = () => Promise<void> | void;

let transition: LoginTransition | undefined;

/** Only the mounted authentication illustration can delay navigation. */
export function registerLoginTransition(handler: LoginTransition) {
  transition = handler;
  return () => {
    if (transition === handler) transition = undefined;
  };
}

export async function playLoginTransition() {
  const handler = transition;
  if (!handler) return;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(handler),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 2200);
      }),
    ]);
  } catch {
    // A decorative effect must never prevent a successful sign-in.
  } finally {
    clearTimeout(timeout);
  }
}

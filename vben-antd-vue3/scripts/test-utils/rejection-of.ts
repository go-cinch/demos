/** Observe the rejection immediately when the test drives completion later. */
export function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('Expected the operation to reject');
    },
    (error: unknown) => error,
  );
}

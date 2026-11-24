/** Require a fixture, mock call or rendered control before inspecting it. */
export function required<T>(value: null | T | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Expected test value to be present');
  return value;
}

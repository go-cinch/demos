type Payload = Record<string, unknown>;

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    );
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null
  ) {
    const leftRecord = left as Payload;
    const rightRecord = right as Payload;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(rightRecord, key) &&
          valuesEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

export function snapshotPayload(source: Payload, keys: string[]): Payload {
  const snapshot: Payload = {};
  for (const key of keys) {
    if (source[key] !== undefined) snapshot[key] = cloneValue(source[key]);
  }
  return snapshot;
}

export function buildChangedPayload(
  original: Payload,
  current: Payload,
): Payload {
  const payload: Payload = {};
  for (const [key, value] of Object.entries(current)) {
    if (!valuesEqual(value, original[key])) payload[key] = value;
  }
  return payload;
}

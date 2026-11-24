import { requiredEntry } from '#/utils/required-entry';
export interface DiffSegment {
  id: number;
  changeIndex?: number;
  text: string;
  changed: boolean;
}

/** Myers' search handles small edits separated by very large equal payloads. */
function sparseChanges(left: string[], right: string[]) {
  const limit = 128;
  const offset = limit + 1;
  const frontier = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  const at = (values: Int32Array, diagonal: number) =>
    values[offset + diagonal] ?? 0;
  for (let distance = 0; distance <= limit; distance++) {
    trace.push(new Int32Array(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x =
        diagonal === -distance ||
        (diagonal !== distance &&
          at(frontier, diagonal - 1) < at(frontier, diagonal + 1))
          ? at(frontier, diagonal + 1)
          : at(frontier, diagonal - 1) + 1;
      let y = x - diagonal;
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x++;
        y++;
      }
      frontier[offset + diagonal] = x;
      if (x < left.length || y < right.length) continue;
      const edits: { before: string; after: string; changed: boolean }[] = [];
      for (let step = distance; step >= 0; step--) {
        const previous = requiredEntry(trace[step], 'diff entry');
        const currentDiagonal = x - y;
        const previousDiagonal =
          currentDiagonal === -step ||
          (currentDiagonal !== step &&
            at(previous, currentDiagonal - 1) <
              at(previous, currentDiagonal + 1))
            ? currentDiagonal + 1
            : currentDiagonal - 1;
        const previousX = at(previous, previousDiagonal);
        const previousY = previousX - previousDiagonal;
        const equalLength = Math.min(x - previousX, y - previousY);
        if (equalLength > 0) {
          const text = left.slice(x - equalLength, x).join('');
          edits.push({ before: text, after: text, changed: false });
          x -= equalLength;
          y -= equalLength;
        }
        if (step > 0) {
          if (x === previousX)
            edits.push({
              before: '',
              after: requiredEntry(right[y - 1], 'diff entry'),
              changed: true,
            });
          else
            edits.push({
              before: requiredEntry(left[x - 1], 'diff entry'),
              after: '',
              changed: true,
            });
        }
        x = previousX;
        y = previousY;
      }
      return edits.toReversed();
    }
  }
  return undefined;
}

/** Compare code points; trim common edges before allocating a bounded LCS table. */
export function compareCharacters(before: string, after: string) {
  const left = [...before];
  const right = [...after];
  const added: DiffSegment[] = [];
  const removed: DiffSegment[] = [];
  let group = -1;
  let previousChanged: boolean | undefined;
  const append = (beforeText: string, afterText: string, changed: boolean) => {
    if (!beforeText && !afterText) return;
    if (previousChanged !== changed) group++;
    previousChanged = changed;
    for (const [target, text] of [
      [removed, beforeText],
      [added, afterText],
    ] as const) {
      if (!text) continue;
      const last = target.at(-1);
      if (last?.id === group) last.text += text;
      else target.push({ id: group, text, changed });
    }
  };
  let endLeft = left.length;
  let endRight = right.length;
  let start = 0;
  while (start < endLeft && start < endRight && left[start] === right[start])
    start++;
  while (
    endLeft > start &&
    endRight > start &&
    left[endLeft - 1] === right[endRight - 1]
  ) {
    endLeft--;
    endRight--;
  }
  const prefix = left.slice(0, start).join('');
  append(prefix, prefix, false);
  const height = endRight - start;
  const width = endLeft - start;
  if (width && height && (width + 1) * (height + 1) <= 250_000) {
    const stride = height + 1;
    const matrix = new Uint32Array((width + 1) * stride);
    const at = (i: number, j: number) => matrix[i * stride + j] ?? 0;
    for (let i = width - 1; i >= 0; i--)
      for (let j = height - 1; j >= 0; j--)
        matrix[i * stride + j] =
          left[start + i] === right[start + j]
            ? at(i + 1, j + 1) + 1
            : Math.max(at(i + 1, j), at(i, j + 1));
    let i = 0;
    let j = 0;
    while (i < width || j < height) {
      if (i < width && j < height && left[start + i] === right[start + j]) {
        append(
          requiredEntry(left[start + i++], 'diff entry'),
          requiredEntry(right[start + j++], 'diff entry'),
          false,
        );
      } else if (i < width && (j === height || at(i + 1, j) >= at(i, j + 1))) {
        append(requiredEntry(left[start + i++], 'diff entry'), '', true);
      } else append('', requiredEntry(right[start + j++], 'diff entry'), true);
    }
  } else {
    const middleLeft = left.slice(start, endLeft);
    const middleRight = right.slice(start, endRight);
    const sparse =
      width && height ? sparseChanges(middleLeft, middleRight) : undefined;
    if (sparse) {
      for (const edit of sparse) append(edit.before, edit.after, edit.changed);
    } else {
      // Bound work for wholesale rewrites while preserving every character.
      append(middleLeft.join(''), middleRight.join(''), true);
    }
  }
  const suffix = left.slice(endLeft).join('');
  append(suffix, suffix, false);
  return { before: removed, after: added };
}

/** Fold only equal content; changed characters are always visible. */
export function foldSegment(segment: Pick<DiffSegment, 'changed' | 'text'>) {
  const characters = [...segment.text];
  return !segment.changed && characters.length > 200
    ? {
        prefix: characters.slice(0, 60).join(''),
        suffix: characters.slice(-60).join(''),
        count: characters.length - 120,
      }
    : undefined;
}

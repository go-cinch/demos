import { isObject, stable } from './catalog-model'

export interface JsonCodeLine {
  text: string
  path: string[]
  number: number
  tokens: { kind: string; text: string }[]
}
export interface JsonComparisonRow {
  local?: JsonCodeLine
  online?: JsonCodeLine
  block: number | null
}
export interface JsonComparisonBlock {
  id: number
  start: number
  end: number
  paths: string[][]
}
type Edit = { local?: number; online?: number }

function tokens(text: string): JsonCodeLine['tokens'] {
  const result: JsonCodeLine['tokens'] = []
  const expression =
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g
  let offset = 0
  for (const match of text.matchAll(expression)) {
    if (match.index > offset) result.push({ kind: 'plain', text: text.slice(offset, match.index) })
    result.push({
      kind: match[1] ? (match[2] ? 'key' : 'string') : match[3] ? 'number' : 'literal',
      text: match[0]
    })
    offset = match.index + match[0].length
  }
  if (offset < text.length) result.push({ kind: 'plain', text: text.slice(offset) })
  return result
}

function jsonLines(value: unknown): JsonCodeLine[] {
  const lines: JsonCodeLine[] = []
  function push(text: string, path: string[]) {
    lines.push({ text, path, number: lines.length + 1, tokens: tokens(text) })
  }
  function write(value: unknown, path: string[], depth: number, label = '', comma = '') {
    const indent = ' '.repeat(depth)
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : isObject(value)
        ? Object.entries(value)
        : []
    if (entries.length) {
      const array = Array.isArray(value)
      push(indent + label + (array ? '[' : '{'), path)
      entries.forEach(([key, item], index) =>
        write(
          item,
          [...path, key],
          depth + 2,
          array ? '' : `${JSON.stringify(key)}: `,
          index < entries.length - 1 ? ',' : ''
        )
      )
      push(indent + (array ? ']' : '}') + comma, path)
    } else push(indent + label + JSON.stringify(value) + comma, path)
  }
  write(JSON.parse(stable(value)), [], 0)
  return lines
}

// Myers handles repeated JSON lines without allocating a full document matrix.
// Cap its search and use unique-line anchors to split large replacements.
function repeatedLineEdits(
  local: JsonCodeLine[],
  online: JsonCodeLine[],
  a: number,
  b: number,
  c: number,
  d: number
): Edit[] | undefined {
  const width = b - a
  const height = d - c
  const positions = new Map<number, number>([[1, 0]])
  const trace: Map<number, number>[] = []
  for (let distance = 0; distance <= Math.min(width + height, 256); distance++) {
    trace.push(new Map(positions))
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x =
        diagonal === -distance ||
        (diagonal !== distance &&
          (positions.get(diagonal - 1) ?? 0) < (positions.get(diagonal + 1) ?? 0))
          ? (positions.get(diagonal + 1) ?? 0)
          : (positions.get(diagonal - 1) ?? 0) + 1
      let y = x - diagonal
      while (x < width && y < height && local[a + x]!.text === online[c + y]!.text) {
        x += 1
        y += 1
      }
      positions.set(diagonal, x)
      if (x < width || y < height) continue
      const result: Edit[] = []
      x = width
      y = height
      for (let step = distance; step >= 0; step--) {
        const previous = trace[step]!
        const k = x - y
        const previousK =
          k === -step || (k !== step && (previous.get(k - 1) ?? 0) < (previous.get(k + 1) ?? 0))
            ? k + 1
            : k - 1
        const previousX = previous.get(previousK) ?? 0
        const previousY = previousX - previousK
        while (x > previousX && y > previousY) result.push({ local: a + --x, online: c + --y })
        if (step === 0) break
        if (x === previousX) result.push({ online: c + --y })
        else result.push({ local: a + --x })
      }
      return result.reverse()
    }
  }
}

function uniqueAnchors(
  local: JsonCodeLine[],
  online: JsonCodeLine[],
  a: number,
  b: number,
  c: number,
  d: number
): [number, number][] {
  const left = new Map<string, number>()
  const right = new Map<string, number>()
  for (let i = a; i < b; i++) left.set(local[i]!.text, left.has(local[i]!.text) ? -1 : i)
  for (let i = c; i < d; i++) right.set(online[i]!.text, right.has(online[i]!.text) ? -1 : i)
  const pairs: [number, number][] = []
  for (const [text, index] of left) {
    const other = right.get(text)
    if (index >= 0 && other !== undefined && other >= 0) pairs.push([index, other])
  }
  const tails: number[] = []
  const previous = new Array<number>(pairs.length).fill(-1)
  pairs.forEach((pair, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (pairs[tails[middle]!]![1] < pair[1]) low = middle + 1
      else high = middle
    }
    previous[index] = low ? tails[low - 1]! : -1
    tails[low] = index
  })
  const anchors: [number, number][] = []
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!)
    anchors.push(pairs[index]!)
  return anchors.reverse()
}

export function compareJson(localValue: unknown, onlineValue: unknown) {
  const local = jsonLines(localValue)
  const online = jsonLines(onlineValue)
  const edits: Edit[] = []
  function compare(a: number, b: number, c: number, d: number) {
    while (a < b && c < d && local[a]!.text === online[c]!.text)
      edits.push({ local: a++, online: c++ })
    let suffix = 0
    while (
      a < b - suffix &&
      c < d - suffix &&
      local[b - suffix - 1]!.text === online[d - suffix - 1]!.text
    )
      suffix += 1
    const leftEnd = b - suffix
    const rightEnd = d - suffix
    if (a === leftEnd || c === rightEnd) {
      for (let i = a; i < leftEnd; i++) edits.push({ local: i })
      for (let i = c; i < rightEnd; i++) edits.push({ online: i })
    } else {
      const anchors = uniqueAnchors(local, online, a, leftEnd, c, rightEnd)
      if (anchors.length) {
        for (const [left, right] of anchors) {
          compare(a, left, c, right)
          edits.push({ local: left, online: right })
          a = left + 1
          c = right + 1
        }
        compare(a, leftEnd, c, rightEnd)
      } else {
        const repeated = repeatedLineEdits(local, online, a, leftEnd, c, rightEnd)
        if (repeated) edits.push(...repeated)
        else {
          for (let i = a; i < leftEnd; i++) edits.push({ local: i })
          for (let i = c; i < rightEnd; i++) edits.push({ online: i })
        }
      }
    }
    for (let i = 0; i < suffix; i++) edits.push({ local: leftEnd + i, online: rightEnd + i })
  }
  compare(0, local.length, 0, online.length)
  const rows: JsonComparisonRow[] = []
  const blocks: JsonComparisonBlock[] = []
  for (let i = 0; i < edits.length; ) {
    const edit = edits[i]!
    if (edit.local !== undefined && edit.online !== undefined) {
      rows.push({
        local: local[edit.local],
        online: online[edit.online],
        block: null
      })
      i += 1
      continue
    }
    const left: JsonCodeLine[] = []
    const right: JsonCodeLine[] = []
    while (i < edits.length) {
      const entry = edits[i]!
      if (entry.local !== undefined && entry.online !== undefined) break
      if (entry.local !== undefined) left.push(local[entry.local]!)
      if (entry.online !== undefined) right.push(online[entry.online]!)
      i += 1
    }
    const block: JsonComparisonBlock = {
      id: blocks.length,
      start: rows.length,
      end: rows.length + Math.max(left.length, right.length) - 1,
      paths: [...left, ...right].map((line) => line.path)
    }
    for (let index = 0; index < Math.max(left.length, right.length); index++)
      rows.push({ local: left[index], online: right[index], block: block.id })
    blocks.push(block)
  }
  return {
    rows,
    blocks,
    localText: local.map((line) => line.text).join('\n'),
    onlineText: online.map((line) => line.text).join('\n')
  }
}

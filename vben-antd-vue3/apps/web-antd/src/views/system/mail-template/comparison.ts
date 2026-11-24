import type { MailTemplate, MailVersion } from '#/api/mail-template';

export interface DiffLine {
  number: number;
  text: string;
}
export interface DiffRow {
  before?: DiffLine;
  after?: DiffLine;
  changed: boolean;
}
export interface TemplateDifference {
  key: string;
  label: string;
  locale?: 'en-US' | 'zh-CN';
  before: string;
  after: string;
  rows: DiffRow[];
}

/** Line alignment with bounded memory for large pasted email sources. */
export function compareLines(before: string, after: string): DiffRow[] {
  const left = before === '' ? [] : before.split('\n');
  const right = after === '' ? [] : after.split('\n');
  const rows: DiffRow[] = [];
  const line = (values: string[], index: number): DiffLine => ({
    number: index + 1,
    text: values[index] ?? '',
  });
  let start = 0;
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  ) {
    rows.push({
      before: line(left, start),
      after: line(right, start),
      changed: false,
    });
    start++;
  }
  let endLeft = left.length;
  let endRight = right.length;
  while (
    endLeft > start &&
    endRight > start &&
    left[endLeft - 1] === right[endRight - 1]
  ) {
    endLeft--;
    endRight--;
  }
  const width = endLeft - start;
  const height = endRight - start;
  const edits: { before?: DiffLine; after?: DiffLine }[] = [];
  if ((width + 1) * (height + 1) <= 250_000) {
    const stride = height + 1;
    const matrix = new Uint32Array((width + 1) * stride);
    const lengthAt = (i: number, j: number) => matrix[i * stride + j] ?? 0;
    for (let i = width - 1; i >= 0; i--)
      for (let j = height - 1; j >= 0; j--)
        matrix[i * stride + j] =
          left[start + i] === right[start + j]
            ? lengthAt(i + 1, j + 1) + 1
            : Math.max(lengthAt(i + 1, j), lengthAt(i, j + 1));
    let i = 0;
    let j = 0;
    while (i < width || j < height) {
      if (i < width && j < height && left[start + i] === right[start + j]) {
        edits.push({
          before: line(left, start + i++),
          after: line(right, start + j++),
        });
      } else if (
        i < width &&
        (j === height || lengthAt(i + 1, j) >= lengthAt(i, j + 1))
      ) {
        edits.push({ before: line(left, start + i++) });
      } else edits.push({ after: line(right, start + j++) });
    }
  } else {
    // For a very large replacement, preserve all text without a quadratic scan.
    for (let i = start; i < endLeft; i++) edits.push({ before: line(left, i) });
    for (let i = start; i < endRight; i++)
      edits.push({ after: line(right, i) });
  }
  for (let i = 0; i < edits.length;) {
    const edit = edits[i];
    if (!edit) break;
    if (edit.before && edit.after) {
      rows.push({ ...edit, changed: false });
      i++;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (i < edits.length && !(edits[i]?.before && edits[i]?.after)) {
      const item = edits[i++];
      if (!item) break;
      if (item.before) removed.push(item.before);
      if (item.after) added.push(item.after);
    }
    for (let index = 0; index < Math.max(removed.length, added.length); index++)
      rows.push({ before: removed[index], after: added[index], changed: true });
  }
  for (let i = endLeft, j = endRight; i < left.length; i++, j++)
    rows.push({ before: line(left, i), after: line(right, j), changed: false });
  return rows;
}

const previewValues = (value: Record<string, string> = {}) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    null,
    2,
  );

function comparisonFields(
  draft: MailTemplate,
  published?: MailVersion,
): Omit<TemplateDifference, 'rows'>[] {
  const fields: Omit<TemplateDifference, 'rows'>[] = [
    {
      key: 'name',
      label: 'name',
      before: published?.name ?? '',
      after: draft.name,
    },
    {
      key: 'category',
      label: 'category',
      before: published?.category ?? '',
      after: draft.category,
    },
  ];
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const before = published?.content[locale];
    const after = draft.content[locale];
    for (const key of ['subject', 'html', 'text'] as const)
      fields.push({
        key: `${locale}.${key}`,
        label: key,
        locale,
        before: before?.[key] ?? '',
        after: after[key],
      });
    fields.push({
      key: `${locale}.preview_values`,
      label: 'previewValues',
      locale,
      before: previewValues(before?.preview_values),
      after: previewValues(after.preview_values),
    });
  }
  return fields;
}

export function hasTemplateDifferences(
  draft: MailTemplate,
  published: MailVersion,
): boolean {
  return comparisonFields(draft, published).some(
    (field) => field.before !== field.after,
  );
}

export function templateDifferences(
  draft: MailTemplate,
  published?: MailVersion,
): TemplateDifference[] {
  return comparisonFields(draft, published)
    .filter((field) => field.before !== field.after)
    .map((field) => ({
      ...field,
      rows: compareLines(field.before, field.after),
    }));
}

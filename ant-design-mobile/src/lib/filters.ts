import type { FilterDefinition } from './resource-config';

/** URL values and interactive values must share one representation. */
export function parseFilters(search: string, definitions: FilterDefinition[]) {
  const params = new URLSearchParams(search);
  const result: Record<string, unknown> = {};
  for (const field of definitions) {
    const values = params.getAll(field.key).filter(Boolean);
    if (!values.length) continue;
    if (field.type === 'status-multi-select') {
      const statuses = values
        .flatMap((v) => v.split(','))
        .map(Number)
        .filter((v) => [0, 1, 2].includes(v));
      if (statuses.length) result[field.key] = [...new Set(statuses)];
    } else if (field.type === 'input-multi-select') {
      result[field.key] = [
        ...new Set(
          values
            .flatMap((v) => v.split(','))
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ];
    } else if (field.type === 'category') {
      const category = Number(values[0]);
      if ([0, 1].includes(category)) result[field.key] = category;
    } else result[field.key] = values[0];
  }
  return result;
}

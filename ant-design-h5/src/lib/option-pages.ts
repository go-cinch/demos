import type { PageResult, ResourceKind } from './types';

export async function loadOptionPage(
  resource: ResourceKind,
  query: string,
  page: number,
  load: (kind: ResourceKind, params: Record<string, unknown>) => Promise<PageResult>,
) {
  const fields = resource === 'user' ? ['username', 'code'] : ['name', 'word'];
  const results = await Promise.all(
    (query.trim() ? fields : ['']).map((field) =>
      load(resource, { p: page, s: 30, ...(field ? { [field]: query.trim() } : {}) }),
    ),
  );
  const items = [
    ...new Map(
      results
        .flatMap((r) => r.items)
        .map((r) => {
          const item = {
            value: resource === 'action' ? String(r.code) : r.id,
            label: `${r.name || r.username} · ${r.word || r.code}`,
          };
          return [item.value, item];
        }),
    ).values(),
  ];
  return { items, hasMore: results.some((result) => page * 30 < result.t) };
}

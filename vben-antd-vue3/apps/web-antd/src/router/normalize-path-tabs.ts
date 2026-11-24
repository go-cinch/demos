import type { TabDefinition } from '@vben/types';

/** Consolidate legacy query-keyed tabs while preserving the active location and pin order. */
export function normalizePathTabs(
  tabs: TabDefinition[],
  currentPath: string,
  path: string,
) {
  const matches = tabs.filter((tab) => tab.path === path);
  if (matches.length === 0) return tabs;
  if (
    matches.length === 1 &&
    matches[0]?.key === path &&
    matches[0].meta.fullPathKey === false
  )
    return tabs;

  const selected =
    matches.find((tab) => tab.fullPath === currentPath) ?? matches[0];
  if (!selected) return tabs;
  const pinned = matches.find((tab) => tab.meta.affixTab);
  const merged: TabDefinition = {
    ...selected,
    key: path,
    meta: {
      ...selected.meta,
      fullPathKey: false,
      ...(pinned
        ? { affixTab: true, affixTabOrder: pinned.meta.affixTabOrder }
        : {}),
    },
  };
  let retained = false;
  return tabs.flatMap((tab) => {
    if (tab.path !== path) return [tab];
    if (retained) return [];
    retained = true;
    return [merged];
  });
}

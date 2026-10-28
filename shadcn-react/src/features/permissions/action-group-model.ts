export class ActionGroupCatalogError extends Error {
  constructor(
    public readonly reason: 'groupExists' | 'groupCatalogUnavailable' | 'groupLanguagesChanged'
  ) {
    super(reason);
  }
}

export interface GroupCatalog {
  default_locale: string;
  locales: { tag: string; name: string; enabled: boolean }[];
  messages: Record<string, unknown>;
  group_order?: string[];
  group_defaults?: Record<string, boolean>;
}
export type PermissionGroupType = 0 | 1 | 2;

export const isPermissionGroupType = (value: unknown): value is PermissionGroupType =>
  value === 0 || value === 1 || value === 2;

export interface ActionGroupDraft {
  type?: PermissionGroupType;
  isDefault?: boolean;
  word: string;
  names: Record<string, string>;
  attempted: boolean;
}
// Missing keys mean non-default; store only enabled groups.
export function pruneGroupDefaults(document: { group_defaults?: Record<string, boolean> }) {
  if (!document.group_defaults) return;
  for (const [word, enabled] of Object.entries(document.group_defaults))
    if (enabled === false) delete document.group_defaults[word];
  if (!Object.keys(document.group_defaults).length) delete document.group_defaults;
}
export function cleanGroupCatalog<T extends GroupCatalog>(source: T): T {
  const document = JSON.parse(JSON.stringify(source)) as T;
  Reflect.deleteProperty(document, 'group_aliases');
  pruneGroupDefaults(document);
  return document;
}
export function recordGroupRename(renames: Record<string, string>, from: string, to: string) {
  const next = { ...renames };
  delete next[to];
  for (const [key, target] of Object.entries(next)) if (target === from) next[key] = to;
  next[from] = to;
  return next;
}
export function pendingGroupRenames(
  base: GroupCatalog,
  document: GroupCatalog,
  renames: Record<string, string>
) {
  const previous = new Set(groupWords(base));
  const current = new Set(groupWords(document));
  return Object.fromEntries(
    Object.entries(renames).filter(
      ([from, to]) => previous.has(from) && !current.has(from) && current.has(to)
    )
  );
}
// Upgrade existing browser drafts without keeping aliases in either catalog.
export function legacyGroupRenames(base: GroupCatalog, document: GroupCatalog) {
  const aliases = (document as GroupCatalog & { group_aliases?: unknown }).group_aliases;
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) return {};
  return pendingGroupRenames(
    base,
    document,
    Object.fromEntries(
      Object.entries(aliases).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  );
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function groupWords(source: GroupCatalog) {
  return [
    ...new Set(
      Object.values(source.messages).flatMap((messages) =>
        Object.keys(object(object(object(messages).frontend).groups))
      )
    )
  ];
}
export function groupNames(source: GroupCatalog, word: string) {
  return Object.fromEntries(
    source.locales.map((locale) => {
      const name = object(object(object(source.messages[locale.tag]).frontend).groups)[word];
      return [locale.tag, typeof name === 'string' ? name : ''];
    })
  );
}
export function changePermissionGroup<T extends GroupCatalog>(
  source: T,
  original: string | undefined,
  word: string,
  names: Record<string, string>,
  isDefault?: boolean
): T {
  const previousNames = original ? groupNames(source, original) : {};
  const defaultName = Object.hasOwn(names, source.default_locale)
    ? names[source.default_locale]
    : previousNames[source.default_locale];
  if (
    !defaultName?.trim() ||
    Object.keys(names).some((tag) => !source.locales.some((locale) => locale.tag === tag))
  )
    throw new ActionGroupCatalogError('groupLanguagesChanged');
  if (word !== original && groupWords(source).includes(word))
    throw new ActionGroupCatalogError('groupExists');
  const document = cleanGroupCatalog(source);
  for (const locale of document.locales) {
    const messages = object(document.messages[locale.tag]);
    const frontend = object(messages.frontend);
    const groups = object(frontend.groups);
    if (original && original !== word && Object.hasOwn(groups, original)) {
      groups[word] = groups[original];
      delete groups[original];
    }
    if (Object.hasOwn(names, locale.tag)) {
      const name = names[locale.tag]!.trim();
      if (name) groups[word] = name;
      else delete groups[word];
    }
    frontend.groups = groups;
    messages.frontend = frontend;
    document.messages[locale.tag] = messages;
  }
  if (
    original &&
    original !== word &&
    document.group_defaults &&
    Object.hasOwn(document.group_defaults, original)
  ) {
    document.group_defaults[word] = document.group_defaults[original]!;
    delete document.group_defaults[original];
  }
  if (isDefault === true) (document.group_defaults ??= {})[word] = true;
  else if (isDefault === false && document.group_defaults) delete document.group_defaults[word];
  pruneGroupDefaults(document);
  if (original && original !== word) {
    if (document.group_order)
      document.group_order = [
        ...new Set(document.group_order.map((key) => (key === original ? word : key)))
      ];
  } else if (!original && document.group_order?.length)
    document.group_order = [...new Set([...document.group_order, word])];
  return document;
}
export function removePermissionGroup<T extends GroupCatalog>(source: T, word: string): T {
  const document = cleanGroupCatalog(source);
  for (const messages of Object.values(document.messages))
    delete object(object(object(messages).frontend).groups)[word];
  if (document.group_order)
    document.group_order = document.group_order.filter((key) => key !== word);
  if (document.group_defaults) delete document.group_defaults[word];
  pruneGroupDefaults(document);
  return document;
}

export function applyGroupOrder<T extends { name: string }>(groups: T[], order: string[]) {
  const entries = new Map(groups.map((group) => [group.name, group]));
  return [...new Set([...order, ...entries.keys()])].flatMap((key) => {
    const group = entries.get(key);
    return group ? [group] : [];
  });
}

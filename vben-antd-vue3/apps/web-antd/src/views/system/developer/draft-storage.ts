import type { Draft } from './catalog-model';

import {
  isPermissionGroupType,
  legacyGroupRenames,
} from '../components/action-group-model';
import { referencedOperations } from '../components/resource-references';
import {
  clone,
  equal,
  initialUI,
  isCatalog,
  isObject,
  isResourceEditor,
  messageCategories,
  normalizeCatalog,
} from './catalog-model';
import {
  legacyResourceRenames,
  pendingResourceRenames,
  readRenameMap,
} from './resource-renames';

function editableState(draft: Draft) {
  const { ui } = draft;
  return [
    draft.version,
    draft.base,
    draft.document,
    ui.buffer,
    ui.resourceEditor,
    ui.groupEditor,
    ui.resourceRenames,
    ui.featureRenames,
    ui.groupRenames,
    ui.groupTypes,
    ui.resolutions,
    ui.resolutionSnapshot,
    ui.newScope,
  ];
}

export class DraftStorage {
  private last: null | string;
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    readonly key: string,
  ) {
    this.last = storage.getItem(key);
  }
  changed() {
    const current = this.storage.getItem(this.key);
    if (current === this.last) return false;
    if (!current || !this.last) return true;
    try {
      if (
        !equal(
          editableState(this.decode(this.last)),
          editableState(this.decode(current)),
        )
      )
        return true;
    } catch {
      return true;
    }
    // A sibling only navigated or re-saved the same draft. Use its revision
    // for the next write, keeping this tab's current selection and filters.
    this.last = current;
    return false;
  }
  load(): Draft | null {
    return this.last ? this.decode(this.last) : null;
  }
  raw() {
    return this.storage.getItem(this.key);
  }
  save(value: Draft) {
    if (this.changed()) throw new Error('LOCAL_DRAFT_CHANGED');
    const raw = JSON.stringify(value);
    // Synchronous persistence is intentional: a refresh immediately after an
    // input event must retain the last character, including invalid form input.
    this.storage.setItem(this.key, raw);
    this.last = raw;
  }
  private decode(raw: string): Draft {
    const value: unknown = JSON.parse(raw);
    if (
      !isObject(value) ||
      value.version !== 1 ||
      !isCatalog(value.base) ||
      !isCatalog(value.document) ||
      !isObject(value.ui) ||
      typeof value.sequence !== 'number' ||
      typeof value.owner !== 'string' ||
      typeof value.savedAt !== 'number'
    )
      throw new Error('Invalid local draft');
    const groupRenames = legacyGroupRenames(value.base, value.document);
    const renames = legacyResourceRenames(value.base, value.document);
    const base = normalizeCatalog(value.base);
    value.base = base;
    const document = normalizeCatalog(value.document);
    value.document = document;
    const defaults = initialUI();
    const ui: Record<string, unknown> = {
      ...defaults,
      ...value.ui,
      groupRenames: {
        ...groupRenames,
        ...(isObject(value.ui.groupRenames) ? value.ui.groupRenames : {}),
      },
    };
    value.ui = ui;
    const pending = pendingResourceRenames(
      base,
      document,
      { ...renames.resources, ...readRenameMap(ui.resourceRenames) },
      { ...renames.features, ...readRenameMap(ui.featureRenames) },
    );
    ui.resourceRenames = pending.resources;
    ui.featureRenames = pending.features;
    if (
      !isObject(ui.groupRenames) ||
      Object.values(ui.groupRenames).some((value) => typeof value !== 'string')
    )
      throw new Error('Invalid group rename state');
    if (ui.tab === 'settings') ui.tab = 'resources';
    for (const [key, entry] of Object.entries(defaults)) {
      const incoming = ui[key];
      if (
        entry !== null &&
        (Array.isArray(entry)
          ? !Array.isArray(incoming)
          : typeof incoming !== typeof entry)
      )
        throw new Error('Invalid editor state');
    }
    if (!messageCategories.includes(String(ui.category))) {
      ui.category = 'frontend';
      ui.messagePage = 1;
    }
    if (
      !isObject(ui.groupTypes) ||
      Object.values(ui.groupTypes).some(
        (value) => !isPermissionGroupType(value),
      )
    )
      throw new Error('Invalid permission group types');
    if (
      ui.groupEditor !== null &&
      (!isObject(ui.groupEditor) ||
        typeof ui.groupEditor.original !== 'string' ||
        typeof ui.groupEditor.word !== 'string' ||
        typeof ui.groupEditor.attempted !== 'boolean' ||
        (ui.groupEditor.type !== undefined &&
          !isPermissionGroupType(ui.groupEditor.type)) ||
        (ui.groupEditor.isDefault !== undefined &&
          typeof ui.groupEditor.isDefault !== 'boolean') ||
        !isObject(ui.groupEditor.names) ||
        Object.values(ui.groupEditor.names).some(
          (name) => typeof name !== 'string',
        ))
    )
      throw new Error('Invalid group editor');
    if (isObject(ui.groupEditor) && ui.groupEditor.isDefault === undefined)
      ui.groupEditor.isDefault =
        document.group_defaults?.[String(ui.groupEditor.original)] === true;
    const buffer = ui.buffer;
    if (
      isObject(buffer) &&
      buffer.kind === 'message' &&
      !messageCategories.includes(String(buffer.category))
    )
      buffer.category = 'frontend';
    if (isObject(ui.resourceEditor)) {
      if (Array.isArray(ui.resourceEditor.entries))
        for (const entry of ui.resourceEditor.entries)
          if (isObject(entry)) {
            Reflect.deleteProperty(entry, 'type');
            Reflect.deleteProperty(entry, 'zh');
            Reflect.deleteProperty(entry, 'en');
          }
      const original =
        document.resource_catalog.resources[
          String(ui.resourceEditor.original ?? '')
        ];
      if (ui.resourceEditor.permissionScope === undefined)
        ui.resourceEditor.permissionScope = original?.permission_scope ?? '';
      const legacyCollection =
        ui.resourceEditor.collection === 'default_permissions';
      if (ui.resourceEditor.frontendVisible === undefined)
        ui.resourceEditor.frontendVisible =
          original?.frontend_visible ?? !legacyCollection;
      if (ui.resourceEditor.references === undefined)
        ui.resourceEditor.references = clone(original?.references ?? []);
      if (
        ui.resourceEditor.referenceOperations === undefined &&
        Array.isArray(ui.resourceEditor.references)
      ) {
        const owner = String(ui.resourceEditor.original ?? '');
        ui.resourceEditor.referenceOperations = Object.fromEntries(
          ui.resourceEditor.references.map((target) => [
            String(target),
            legacyCollection
              ? ['read']
              : referencedOperations(
                  document.resource_catalog,
                  owner,
                  String(target),
                ),
          ]),
        );
      }
      Reflect.deleteProperty(ui.resourceEditor, 'collection');
    }
    if (isObject(buffer)) Reflect.deleteProperty(buffer, 'entryType');
    if (ui.resourceEditor !== null && !isResourceEditor(ui.resourceEditor))
      throw new Error('Invalid resource editor');
    if (
      buffer !== null &&
      (!isObject(buffer) ||
        !['entry', 'feature', 'message', 'resource'].includes(
          String(buffer.kind),
        ) ||
        typeof buffer.key !== 'string' ||
        typeof buffer.zh !== 'string' ||
        typeof buffer.en !== 'string' ||
        !Array.isArray(buffer.buttons) ||
        !Array.isArray(buffer.http) ||
        !Array.isArray(buffer.grpc))
    ) {
      throw new Error('Invalid editor buffer');
    }
    return clone(value) as unknown as Draft;
  }
}

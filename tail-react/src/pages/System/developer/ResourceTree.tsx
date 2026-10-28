import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { resourceChildren } from '../components/resource-order';
import SimpleSelect from '../SimpleSelect';
import type { Catalog } from './catalog-model';
import { resourceStep, type ResourceDestination } from './resource-movement';
import { referencePosition, referenceStep, resourceDropTarget, resourceRowId, type ResourceDrop, type ResourceTreeRow } from './resource-drag';

interface Props {
  catalog: Catalog; scope: string; query: string; editable: boolean;
  selected: string; label: (key: string) => string; onSelect: (key: string) => void;
  onMove: (key: string, destination: ResourceDestination) => void;
  onReferenceMove: (owner: string, key: string, destination: ResourceDestination) => void;
}
const arrowClass = 'grid size-7 shrink-0 place-items-center rounded-md border border-gray-200 text-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-800';
export default function ResourceTree({ catalog, scope, query, editable, selected, label, onSelect, onMove, onReferenceMove }: Props) {
  const { t } = useTranslation(); const d = (key: string) => String(t(`developer.${key}`));
  const source = useRef<ResourceTreeRow | null>(null);
  const [dragging, setDragging] = useState<string>();
  const [preview, setPreview] = useState<ResourceDrop | null>(null);
  const enabled = editable && !query.trim();
  function finish() { source.current = null; setDragging(undefined); setPreview(null); }
  function destination(event: DragEvent<HTMLElement>, target: ResourceTreeRow, inside = false) {
    if (!enabled || !source.current) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    return resourceDropTarget(catalog, scope, source.current, target, (event.clientY - bounds.top) / Math.max(bounds.height, 1), inside);
  }
  function over(event: DragEvent<HTMLElement>, target: ResourceTreeRow, inside = false) {
    event.stopPropagation(); const next = destination(event, target, inside); setPreview(next);
    if (event.dataTransfer) event.dataTransfer.dropEffect = next ? 'move' : 'none';
    if (next) event.preventDefault();
  }
  function drop(event: DragEvent<HTMLElement>, target: ResourceTreeRow, inside = false) {
    event.stopPropagation(); event.preventDefault();
    const next = destination(event, target, inside); const row = source.current; finish();
    if (!next || !row) return;
    if (row.kind === 'reference') onReferenceMove(row.parent, row.key, next.destination);
    else onMove(row.key, next.destination);
  }
  function step(row: ResourceTreeRow, direction: -1 | 1) {
    if (!enabled) return;
    const next = row.kind === 'reference' ? referenceStep(catalog, row.parent, row.key, direction) : resourceStep(catalog, row.key, direction);
    if (!next) return;
    if (row.kind === 'reference') onReferenceMove(row.parent, row.key, next); else onMove(row.key, next);
  }
  const tree = (parent = '', seen = new Set<string>()): ReactNode => {
    const order = resourceChildren(catalog.resource_catalog, parent, scope);
    return <ul className="space-y-2">{order.map((item, index) => {
      const node = catalog.resource_catalog.resources[item.key]; const row = { ...item, parent }; const id = resourceRowId(row);
      if (!node || seen.has(id)) return null;
      if (query && !`${item.key} ${label(item.key)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && node.kind !== 'directory') return null;
      const next = new Set(seen).add(id);
      const activeDrop = preview && resourceRowId(preview.row) === id ? preview.mode : undefined;
      const reference = item.kind === 'reference';
      const up = reference ? referenceStep(catalog, parent, item.key, -1) : resourceStep(catalog, item.key, -1);
      const down = reference ? referenceStep(catalog, parent, item.key, 1) : resourceStep(catalog, item.key, 1);
      return <li key={id} className="rounded-lg border border-gray-200 p-2 dark:border-gray-700" data-tree-kind={item.kind} data-tree-owner={parent}>
        <div data-tree-key={id} data-resource-key={reference ? undefined : item.key} data-reference-key={reference ? item.key : undefined} data-drop-mode={activeDrop}
          className={`relative flex min-h-10 items-center gap-1 rounded-md px-1 py-1 ${dragging === id ? 'opacity-40' : ''} ${activeDrop === 'inside' ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15' : ''}`}
          draggable={enabled}
          onDragStart={event => { event.stopPropagation(); if (!enabled) { event.preventDefault(); return; } source.current = row; setDragging(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }}
          onDragEnd={event => { event.stopPropagation(); finish(); }}
          onDragOver={event => over(event, row)} onDrop={event => drop(event, row)}
          onDragLeave={event => { const related = event.relatedTarget; if (!(related instanceof Node) || !event.currentTarget.contains(related)) setPreview(null); }}>
          {activeDrop && activeDrop !== 'inside' && <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 h-0.5 bg-brand-500 ${activeDrop === 'before' ? 'top-0' : 'bottom-0'}`} />}
          <button type="button" aria-pressed={selected === item.key} aria-keyshortcuts={enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
            className="min-w-0 flex-1 text-start text-sm font-medium break-words aria-pressed:text-brand-600 dark:aria-pressed:text-brand-300"
            title={reference ? `${d('goToOriginal')}: ${item.key}` : item.key}
            onClick={() => onSelect(item.key)} onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); step(row, event.key === 'ArrowUp' ? -1 : 1); } }}>
            {reference ? '↗ ' : node.kind === 'directory' ? '▸ ' : '· '}{label(item.key)}
          </button>
          {editable && <><button type="button" className={arrowClass} aria-label={reference ? d('referenceUp') : d('moveUp')} disabled={!enabled || !up} onClick={() => step(row, -1)}>↑</button><button type="button" className={arrowClass} aria-label={reference ? d('referenceDown') : d('moveDown')} disabled={!enabled || !down} onClick={() => step(row, 1)}>↓</button></>}
          {!reference && node.kind === 'directory' && <span data-testid="resource-drop-inside" role="group" aria-label={`${d('dropIntoDirectory')} ${label(item.key)}`} title={`${d('dropIntoDirectory')} ${label(item.key)}`}
            className={`grid min-h-9 w-8 shrink-0 place-items-center rounded border border-dashed ${activeDrop === 'inside' ? 'border-brand-500 text-brand-600 dark:text-brand-300' : 'border-gray-300 text-gray-400 dark:border-gray-600'}`}
            onDragOver={event => over(event, row, true)} onDrop={event => drop(event, row, true)}>↳</span>}
        </div>
        {reference && editable && <fieldset disabled={!enabled} className="mt-2 flex items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400"><span>{d('position')}</span><SimpleSelect className="w-20" ariaLabel={`${d('position')} ${label(item.key)}`} value={index + 1} options={order.map((_, at) => ({ value: at + 1, label: String(at + 1) }))} onChange={position => { const target = referencePosition(catalog, parent, item.key, Number(position)); if (enabled && target) onReferenceMove(parent, item.key, target); }} /></fieldset>}
        {node.kind === 'directory' && !reference && <div className="mt-2 ps-3">{tree(item.key, next)}</div>}
      </li>;
    })}</ul>;
  };
  return <div data-testid="resource-catalog-tree"><p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{d('treeHierarchyHint')}</p><p className="sr-only" role="status" aria-live="polite">{preview ? `${preview.mode === 'inside' ? d('dropIntoDirectory') : d(preview.mode === 'before' ? 'moveUp' : 'moveDown')} ${label(preview.row.key)}` : ''}</p>{tree()}</div>;
}

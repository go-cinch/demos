import type { ObjectDirective } from 'vue';

import './skeleton.css';

type SkeletonValue = boolean | { loading: boolean; targets?: string };
const owners = new WeakMap<Element, Set<HTMLElement>>();
const states = new WeakMap<HTMLElement, { inert: boolean; busy: null | string; parts: HTMLElement[]; observer: MutationObserver }>();
const defaultTargets = 'h1,h2,h3,h4,p,dt,dd,strong,b,small,time,code,pre,button,input,textarea,svg,img,canvas,[role="img"],.ant-tag,.ant-avatar,.ant-select-selector,span';

function clear(root: HTMLElement) {
  const state = states.get(root);
  if (!state) return;
  state.observer.disconnect();
  for (const part of state.parts) {
    const roots = owners.get(part);
    roots?.delete(root);
    if (!roots?.size) part.classList.remove('layout-skeleton-shape', 'layout-skeleton-static');
  }
  root.classList.remove('layout-skeleton');
  root.inert = state.inert;
  if (state.busy === null) root.removeAttribute('aria-busy');
  else root.setAttribute('aria-busy', state.busy);
  states.delete(root);
}

function update(root: HTMLElement, value: SkeletonValue) {
  clear(root);
  if (!(typeof value === 'boolean' ? value : value?.loading)) return;
  const selector = typeof value === 'object' ? value.targets : undefined;
  const candidates = [...root.querySelectorAll<HTMLElement>(selector || defaultTargets)];
  // Use existing layout boxes. No replacement DOM, measurement cache or extra
  // loading rows on refresh: wrapping, density and responsive widths stay intact.
  const parts = root.matches('button, input, textarea, [role="img"]') ? [root] : candidates.filter((node) =>
    selector || !candidates.some((other) => other !== node && other.contains(node)),
  );
  if (!parts.length) parts.push(root);
  // Async child components (table rows and charts) can mount after this hook.
  const observer = new MutationObserver(() => update(root, value));
  states.set(root, { inert: root.inert, busy: root.getAttribute('aria-busy'), parts, observer });
  observer.observe(root, { childList: true, subtree: true });
  root.inert = true;
  root.setAttribute('aria-busy', 'true');
  root.classList.add('layout-skeleton');
  for (const part of parts) {
    const roots = owners.get(part) ?? new Set<HTMLElement>();
    roots.add(root);
    owners.set(part, roots);
    if (getComputedStyle(part).position === 'static') part.classList.add('layout-skeleton-static');
    part.classList.add('layout-skeleton-shape');
  }
}

export const vSkeleton: ObjectDirective<HTMLElement, SkeletonValue> = {
  mounted: (el, { value }) => update(el, value),
  beforeUpdate: clear,
  updated: (el, { value }) => update(el, value),
  beforeUnmount: clear,
};

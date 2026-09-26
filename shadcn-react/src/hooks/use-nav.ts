'use client';

import type { NavGroup, NavItem } from '@/types';
import { useMemo } from 'react';

// Compatibility hook retained for the starter cleanup templates. Go Cinch
// permissions are enforced by AppSidebar and the resource pages themselves.
export function useFilteredNavItems(items: NavItem[]) {
  return useMemo(() => items, [items]);
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  return useMemo(() => groups, [groups]);
}

'use client';
import { AButton, useAdminText, useAdminTimezone } from './admin-ui';
import { useCatalogLabels } from '@/features/permissions/catalog-context';
import { adminFilterChips, type AdminQuery } from '@/features/admin/model';
export default function ActiveFilters({
  filters,
  onChange
}: {
  filters: AdminQuery;
  onChange?: (changes: AdminQuery) => void;
}) {
  const text = useAdminText(),
    zone = useAdminTimezone();
  const { label } = useCatalogLabels();
  const chips = adminFilterChips(filters, zone, text, (key) => label('groups', key));
  return chips.length ? (
    <div className='mb-3 flex flex-wrap gap-2' data-testid='active-filters'>
      {chips.map((chip) => (
        <AButton key={chip.key} disabled={!onChange} onClick={() => onChange?.(chip.clear)}>
          {chip.label} ×
        </AButton>
      ))}
    </div>
  ) : null;
}

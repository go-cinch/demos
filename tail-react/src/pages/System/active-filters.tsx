"use client";
import { useTranslation } from "react-i18next";
import { AButton, useAdminText, useAdminTimezone } from "./admin-ui";
import { adminFilterChips, type AdminQuery } from "@/utils/admin/model";
export default function ActiveFilters({
  filters,
  onChange,
}: {
  filters: AdminQuery;
  onChange: (changes: AdminQuery) => void;
}) {
  const { t } = useTranslation();
  const text = useAdminText(),
    zone = useAdminTimezone();
  const chips = adminFilterChips(filters, zone, text, (word) =>
    String(t(`groups.${word}`, { defaultValue: word, returnEmptyString: false })),
  );
  return chips.length ? (
    <div className="mb-3 flex flex-wrap gap-2" data-testid="active-filters">
      {chips.map((chip) => (
        <AButton key={chip.key} onClick={() => onChange(chip.clear)}>
          {chip.label} ×
        </AButton>
      ))}
    </div>
  ) : null;
}

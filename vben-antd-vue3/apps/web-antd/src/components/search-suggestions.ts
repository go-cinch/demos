import { $t } from '#/locales';

export function searchSuggestionGroups(values: string[], history: string[]) {
  const backend = [...new Set(values.filter(Boolean))];
  const recent = [...new Set(history.filter(Boolean))].filter((value) => !backend.includes(value));
  return [
    ...(backend.length ? [{ label: $t('system.suggestions.backend'), options: backend.map((value) => ({ value, label: value, source: 'backend' as const })) }] : []),
    ...(recent.length ? [{ label: $t('system.suggestions.history'), options: recent.map((value) => ({ value, label: value, source: 'history' as const })) }] : []),
  ];
}

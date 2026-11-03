import type { FilterSuggestionSegment } from './management-types';
export function matchingSegments(
  value: string,
  query: string,
): FilterSuggestionSegment[] {
  if (!query) return [{ matched: false, text: value }];

  const segments: FilterSuggestionSegment[] = [];
  const normalizedValue = value.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let cursor = 0;
  let matchIndex = normalizedValue.indexOf(normalizedQuery);
  if (matchIndex < 0) return [{ matched: false, text: value }];

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      segments.push({ matched: false, text: value.slice(cursor, matchIndex) });
    }
    const matchEnd = matchIndex + query.length;
    segments.push({ matched: true, text: value.slice(matchIndex, matchEnd) });
    cursor = matchEnd;
    matchIndex = normalizedValue.indexOf(normalizedQuery, cursor);
  }
  if (cursor < value.length) {
    segments.push({ matched: false, text: value.slice(cursor) });
  }
  return segments;
}

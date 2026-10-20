import { describe, expect, it, vi } from 'vitest';

import { searchSuggestionGroups } from './search-suggestions';

vi.mock('#/locales', () => ({ $t: (key: string) => key }));

describe('grouped search suggestions', () => {
  it('deduplicates backend results and history while keeping source labels and ordering', () => {
    const values = ['Alice', '', 'Alice', 'Bob'];
    const history = ['Bob', 'Carol', 'Carol', ''];
    expect(searchSuggestionGroups(values, history)).toEqual([
      {
        label: 'system.suggestions.backend',
        options: [
          { value: 'Alice', label: 'Alice', source: 'backend' },
          { value: 'Bob', label: 'Bob', source: 'backend' },
        ],
      },
      {
        label: 'system.suggestions.history',
        options: [{ value: 'Carol', label: 'Carol', source: 'history' }],
      },
    ]);
    expect(values).toEqual(['Alice', '', 'Alice', 'Bob']);
    expect(history).toEqual(['Bob', 'Carol', 'Carol', '']);
  });
  it('omits empty groups and keeps history available without backend results', () => {
    expect(searchSuggestionGroups([], [])).toEqual([]);
    expect(searchSuggestionGroups([], ['Alice'])).toEqual([
      {
        label: 'system.suggestions.history',
        options: [{ value: 'Alice', label: 'Alice', source: 'history' }],
      },
    ]);
  });
});

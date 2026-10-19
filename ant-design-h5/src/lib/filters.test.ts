import { describe, expect, it } from 'vitest';
import { parseFilters } from './filters';

const fields = [
  { key: 'status', type: 'status-multi-select', label: 'Status' },
  { key: 'code', type: 'input-multi-select', label: 'Code' },
  { key: 'category', type: 'category', label: 'Category' },
  { key: 'name', type: 'input', label: 'Name' },
];
describe('filters restored from shared links', () => {
  it('restores numeric zero, repeated and comma-separated multi-values', () => {
    expect(parseFilters('?status=0,2&status=0&category=0&code=A,B&code=B,C', fields)).toEqual({
      status: [0, 2],
      category: 0,
      code: ['A', 'B', 'C'],
    });
  });
  it('keeps multiline resource rules intact and ignores unrelated parameters', () => {
    expect(parseFilters('?code=GET%7C%2Fx%0APOST%7C%2Fx&name=alpha&redirect=x', fields)).toEqual({
      code: ['GET|/x\nPOST|/x'],
      name: 'alpha',
    });
  });
  it('does not introduce invalid enum or empty filters', () => {
    expect(parseFilters('?status=99&category=bad&code=&name=', fields)).toEqual({});
  });
});

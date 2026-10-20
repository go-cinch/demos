import { beforeEach, describe, expect, it, vi } from 'vitest';

import { auditApi, auditDetailFields, auditProfileFields } from './audit';

const get = vi.hoisted(() => vi.fn());
vi.mock('#/api/request', () => ({ authRequestClient: { get } }));
beforeEach(() => vi.resetAllMocks());

describe('audit API', () => {
  it.each(['login', 'operation'] as const)(
    'preserves %s filters and requests exports as blobs',
    async (kind) => {
      const params = {
        username: 'reader',
        from: 100,
        to: 200,
        p: 2,
        s: 20,
        f: auditProfileFields[kind],
      };
      const page = { items: [{ id: 9 }], p: 2, s: 20, t: 1 };
      get.mockResolvedValue(page);
      await expect(auditApi.list(kind, params)).resolves.toBe(page);
      expect(get).toHaveBeenLastCalledWith(`/audit/${kind}`, { params });
      await auditApi.summary(kind, {
        from: 100,
        to: 200,
        f: 'metrics',
      });
      expect(get).toHaveBeenLastCalledWith(`/audit/${kind}/summary`, {
        params: { from: 100, to: 200, f: 'metrics' },
      });
      await auditApi.options(kind, { field: 'username', q: 'read' });
      expect(get).toHaveBeenLastCalledWith(`/audit/${kind}/option`, {
        params: { field: 'username', q: 'read' },
      });
      await auditApi.get(kind, 9);
      expect(get).toHaveBeenLastCalledWith(`/audit/${kind}/detail/9`, {
        params: { f: auditDetailFields[kind] },
      });
      expect(auditDetailFields[kind].split(',')).not.toContain('header');
      expect(auditDetailFields[kind].includes('request_params')).toBe(kind === 'operation');
      const blob = new Blob(['id\n9'], { type: 'text/csv' });
      get.mockResolvedValue(blob);
      await expect(auditApi.export(kind, { from: 100, to: 200 })).resolves.toBe(
        blob,
      );
      expect(get).toHaveBeenLastCalledWith(`/audit/${kind}/export`, {
        params: { from: 100, to: 200 },
        responseType: 'blob',
      });
    },
  );
});

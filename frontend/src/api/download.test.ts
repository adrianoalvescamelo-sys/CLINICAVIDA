import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadAutenticado, apiUrl } from './download';

describe('download helper', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('apiUrl resolve path relativo contra a origem (não lança)', () => {
    const url = apiUrl('/relatorios/export/agenda-dia/xlsx', { data: '2026-05-23' });
    const parsed = new URL(url);
    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.pathname).toBe('/api/relatorios/export/agenda-dia/xlsx');
    expect(parsed.searchParams.get('data')).toBe('2026-05-23');
  });

  it('apiUrl omite params vazios', () => {
    const url = apiUrl('/x', { a: '1', b: undefined });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('a')).toBe('1');
    expect(parsed.searchParams.has('b')).toBe(false);
  });

  it('downloadAutenticado faz fetch com Bearer e dispara download', async () => {
    await downloadAutenticado(apiUrl('/documentos/abc/pdf', {}), 'tok', 'doc.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { api } from './client';
import { listarDocumentos, criarDocumento, baixarDocumentoPdf } from './documentos';

afterEach(() => vi.restoreAllMocks());

describe('api/documentos', () => {
  it('listarDocumentos faz GET no endpoint do paciente', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [], error: null },
    } as never);
    await listarDocumentos('pac-1');
    expect(spy).toHaveBeenCalledWith('/pacientes/pac-1/documentos');
  });

  it('criarDocumento faz POST com tipo e conteudo', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'doc-1' }, error: null },
    } as never);
    await criarDocumento('pac-1', {
      tipo: 'ORIENTACOES',
      conteudo: { texto: 'repouso' },
    });
    expect(spy).toHaveBeenCalledWith(
      '/pacientes/pac-1/documentos',
      expect.objectContaining({ tipo: 'ORIENTACOES' }),
    );
  });

  describe('baixarDocumentoPdf', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, blob: () => Promise.resolve(new Blob(['x'])),
      }));
      URL.createObjectURL = vi.fn(() => 'blob:mock');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });
    afterEach(() => vi.unstubAllGlobals());

    it('baixa PDF same-origin /api com Bearer', async () => {
      await baixarDocumentoPdf('doc-1', 'RECEITA', 'tok');
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const [url, opts] = fetchMock.mock.calls[0];
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/api/documentos/doc-1/pdf');
      expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
    });
  });
});

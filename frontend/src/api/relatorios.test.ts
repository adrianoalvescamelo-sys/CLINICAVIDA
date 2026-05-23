/**
 * api/relatorios — exports (download direto)
 *
 * Regressão: buildUrl montava `new URL('/api/...')` sem base quando
 * VITE_API_URL='/api' (homolog), lançando TypeError síncrono e deixando o
 * botão de export "inerte". O download deve usar a mesma origem do app.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportXlsx, exportPdf } from './relatorios';

describe('relatorios export — URL same-origin', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    // jsdom não implementa createObjectURL/revokeObjectURL — adiciona no URL real
    // (preservando o construtor new URL usado por buildUrl)
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    // a.click() não faz nada em jsdom, mas evita erro
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exportXlsx não lança e baixa de /api same-origin com token e params', () => {
    expect(() =>
      exportXlsx('agenda-dia', { data: '2026-05-23' }, 'tok123'),
    ).not.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.pathname).toBe('/api/relatorios/export/agenda-dia/xlsx');
    expect(parsed.searchParams.get('data')).toBe('2026-05-23');
    expect((opts as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok123',
    });
  });

  it('exportPdf monta path /pdf e omite params vazios', () => {
    expect(() =>
      exportPdf('pacientes', { inicio: '2026-05-01', fim: undefined }, 'tok'),
    ).not.toThrow();

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/api/relatorios/export/pacientes/pdf');
    expect(parsed.searchParams.get('inicio')).toBe('2026-05-01');
    expect(parsed.searchParams.has('fim')).toBe(false);
  });
});

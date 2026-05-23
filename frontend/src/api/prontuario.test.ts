import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './client';
import {
  getProntuario,
  criarEvolucao,
  retificarEvolucao,
} from './prontuario';

afterEach(() => vi.restoreAllMocks());

describe('api/prontuario', () => {
  it('getProntuario faz GET no endpoint do paciente e retorna data.data', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: { prontuario: null, evolucoes: [] }, error: null },
    } as never);
    const r = await getProntuario('pac-1');
    expect(spy).toHaveBeenCalledWith('/pacientes/pac-1/prontuario');
    expect(r.evolucoes).toEqual([]);
  });

  it('criarEvolucao faz POST com payload', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'evo-1' }, error: null },
    } as never);
    await criarEvolucao('pac-1', {
      agendamentoId: 'ag-1',
      subjetivo: 's',
      objetivo: 'o',
      avaliacao: 'a',
      plano: 'p',
    });
    expect(spy).toHaveBeenCalledWith(
      '/pacientes/pac-1/prontuario/evolucoes',
      expect.objectContaining({ agendamentoId: 'ag-1' }),
    );
  });

  it('retificarEvolucao faz POST no endpoint de retificar', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'evo-2' }, error: null },
    } as never);
    await retificarEvolucao('evo-1', {
      subjetivo: 's', objetivo: 'o', avaliacao: 'a', plano: 'p',
    });
    expect(spy).toHaveBeenCalledWith(
      '/evolucoes/evo-1/retificar',
      expect.any(Object),
    );
  });
});

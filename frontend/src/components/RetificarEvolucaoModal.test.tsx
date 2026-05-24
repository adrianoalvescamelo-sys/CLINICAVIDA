import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RetificarEvolucaoModal from './RetificarEvolucaoModal';
import * as prontuarioApi from '../api/prontuario';
import type { Evolucao } from '../types/prontuario';

const evo: Evolucao = {
  id: 'evo-1', prontuarioId: 'pr-1', agendamentoId: 'ag-1', autorUsuarioId: 'u1',
  autorEhMedico: true, queixaPrincipal: 'dor', subjetivo: 'S', objetivo: 'O',
  avaliacao: 'A', plano: 'P', versao: 1, replacesId: null, createdAt: '2026-05-23T12:00:00.000Z',
};

describe('RetificarEvolucaoModal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('null quando sem evolução', () => {
    const { container } = render(
      <RetificarEvolucaoModal evolucao={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('pré-preenche e envia retificação', async () => {
    const ret = vi.spyOn(prontuarioApi, 'retificarEvolucao').mockResolvedValue({ id: 'evo-2' } as never);
    const onSaved = vi.fn();
    render(<RetificarEvolucaoModal evolucao={evo} onClose={vi.fn()} onSaved={onSaved} />);
    expect((screen.getByLabelText(/subjetivo/i) as HTMLTextAreaElement).value).toBe('S');
    fireEvent.change(screen.getByLabelText(/plano/i), { target: { value: 'P2' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(ret).toHaveBeenCalledWith('evo-1', expect.objectContaining({ plano: 'P2' })));
    expect(onSaved).toHaveBeenCalled();
  });
});

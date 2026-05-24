import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EvolucaoFormModal from './EvolucaoFormModal';
import * as agendaApi from '../api/agenda';
import * as prontuarioApi from '../api/prontuario';

function renderModal(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EvolucaoFormModal open pacienteId="pac-1" onClose={vi.fn()} onSaved={onSaved} />
    </QueryClientProvider>,
  );
}
const ag = {
  id: 'ag-1', dataHoraInicio: '2026-05-23T12:00:00.000Z',
  paciente: { id: 'pac-1', nomeCompleto: 'P' },
  profissional: { id: 'pr-1', nomeCompleto: 'Dr', especialidade: null },
  tipo: 'CONSULTA', status: 'ATENDIDO', origem: 'RECEPCAO', dataHoraFim: '', encaixe: false,
};

describe('EvolucaoFormModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([ag] as never);
  });

  it('envia evolução com agendamento e campos SOAP', async () => {
    const criar = vi.spyOn(prontuarioApi, 'criarEvolucao').mockResolvedValue({ id: 'evo-1' } as never);
    const onSaved = vi.fn();
    renderModal(onSaved);

    await screen.findByRole('option', { name: /Dr/ });
    fireEvent.change(screen.getByLabelText(/agendamento/i), { target: { value: 'ag-1' } });
    fireEvent.change(screen.getByLabelText(/subjetivo/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/objetivo/i), { target: { value: 'O' } });
    fireEvent.change(screen.getByLabelText(/avaliação/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/plano/i), { target: { value: 'P' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(criar).toHaveBeenCalledWith('pac-1', expect.objectContaining({
      agendamentoId: 'ag-1', subjetivo: 'S', objetivo: 'O', avaliacao: 'A', plano: 'P',
    })));
    expect(onSaved).toHaveBeenCalled();
  });

  it('bloqueia submit sem agendamento selecionado', async () => {
    const criar = vi.spyOn(prontuarioApi, 'criarEvolucao').mockResolvedValue({ id: 'x' } as never);
    renderModal();
    await screen.findByRole('option', { name: /Dr/ });
    fireEvent.change(screen.getByLabelText(/subjetivo/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(screen.getByText(/selecione um agendamento/i)).toBeInTheDocument());
    expect(criar).not.toHaveBeenCalled();
  });
});

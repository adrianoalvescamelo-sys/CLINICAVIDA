/**
 * AgendamentoDetalheModal — botões condicionais por status + ações
 *
 * Cobre:
 *  - agendamento=null não renderiza
 *  - dados básicos exibidos (nome, telefone, status badge)
 *  - SOLICITADO mostra Confirmar
 *  - CONFIRMADO mostra Marcar Aguardando
 *  - AGUARDANDO mostra Chamar
 *  - EM_ATENDIMENTO mostra Atendido
 *  - ATENDIDO não mostra ações ativas
 *  - Confirmar dispara alterarStatus
 *  - Faltou usa window.confirm
 *  - Cancelar usa window.prompt
 *  - Chamar dispara chamarAgendamento
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AgendamentoDetalheModal from './AgendamentoDetalheModal';
import * as agendaApi from '../api/agenda';
import type {
  AgendamentoListItem,
  AgendamentoStatus,
} from '../types/agenda';

function renderModal(item: AgendamentoListItem | null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AgendamentoDetalheModal agendamento={item} onClose={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseAg: AgendamentoListItem = {
  id: 'ag-1',
  pacienteId: 'p1',
  profissionalId: 'pr-1',
  dataHoraInicio: '2026-05-20T13:00:00.000Z',
  dataHoraFim: '2026-05-20T13:30:00.000Z',
  tipo: 'CONSULTA',
  status: 'SOLICITADO',
  origem: 'RECEPCAO',
  encaixe: false,
  paciente: {
    id: 'p1',
    nomeCompleto: 'Paciente Alpha',
    telefoneWhatsapp: '65999991111',
  },
  profissional: { id: 'pr-1', nomeCompleto: 'Dr. Beta', cor: '#0f766e' },
};

function withStatus(s: AgendamentoStatus): AgendamentoListItem {
  return { ...baseAg, status: s };
}

describe('AgendamentoDetalheModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('agendamento=null não renderiza', () => {
    const { container } = renderModal(null);
    expect(container.firstChild).toBeNull();
  });

  it('mostra paciente, telefone formatado, status', () => {
    renderModal(baseAg);
    expect(screen.getByText('Paciente Alpha')).toBeInTheDocument();
    expect(screen.getByText('(65) 99999-1111')).toBeInTheDocument();
    expect(screen.getByText('Solicitado')).toBeInTheDocument();
  });

  it('SOLICITADO: mostra Confirmar e Cancelar; oculta Aguardando/Chamar/Atendido', () => {
    renderModal(withStatus('SOLICITADO'));
    expect(screen.getByRole('button', { name: /^confirmar$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aguardando/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^chamar$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^atendido$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^cancelar$/i })).toBeInTheDocument();
  });

  it('CONFIRMADO: mostra Marcar Aguardando', () => {
    renderModal(withStatus('CONFIRMADO'));
    expect(
      screen.getByRole('button', { name: /marcar aguardando/i }),
    ).toBeInTheDocument();
  });

  it('AGUARDANDO: mostra Chamar', () => {
    renderModal(withStatus('AGUARDANDO'));
    expect(screen.getByRole('button', { name: /^chamar$/i })).toBeInTheDocument();
  });

  it('EM_ATENDIMENTO: mostra Atendido', () => {
    renderModal(withStatus('EM_ATENDIMENTO'));
    expect(screen.getByRole('button', { name: /^atendido$/i })).toBeInTheDocument();
  });

  it('ATENDIDO: não mostra ações de transição', () => {
    renderModal(withStatus('ATENDIDO'));
    expect(screen.queryByRole('button', { name: /^confirmar$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^chamar$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^cancelar$/i })).toBeNull();
  });

  it('Confirmar chama alterarStatus(id, CONFIRMADO)', async () => {
    const mock = vi
      .spyOn(agendaApi, 'alterarStatus')
      .mockResolvedValue(baseAg);
    renderModal(baseAg);
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls[0][0]).toBe('ag-1');
    expect(mock.mock.calls[0][1]).toBe('CONFIRMADO');
  });

  it('Faltou usa window.confirm; cancel aborta', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const alterarMock = vi.spyOn(agendaApi, 'alterarStatus');
    renderModal(baseAg);
    fireEvent.click(screen.getByRole('button', { name: /^faltou$/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(alterarMock).not.toHaveBeenCalled();
  });

  it('Cancelar usa window.prompt; null vira undefined motivo', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const alterarMock = vi
      .spyOn(agendaApi, 'alterarStatus')
      .mockResolvedValue(baseAg);

    renderModal(baseAg);
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    await waitFor(() => expect(alterarMock).toHaveBeenCalled());
    expect(alterarMock.mock.calls[0][1]).toBe('CANCELADO');
    expect(alterarMock.mock.calls[0][2]).toBeUndefined();
  });

  it('Chamar (AGUARDANDO) dispara chamarAgendamento', async () => {
    const mock = vi
      .spyOn(agendaApi, 'chamarAgendamento')
      .mockResolvedValue(baseAg);
    renderModal(withStatus('AGUARDANDO'));
    fireEvent.click(screen.getByRole('button', { name: /^chamar$/i }));
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls[0][0]).toBe('ag-1');
  });

  it('Atendido (EM_ATENDIMENTO) dispara marcarAgendamentoAtendido', async () => {
    const mock = vi
      .spyOn(agendaApi, 'marcarAgendamentoAtendido')
      .mockResolvedValue(baseAg);
    renderModal(withStatus('EM_ATENDIMENTO'));
    fireEvent.click(screen.getByRole('button', { name: /^atendido$/i }));
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls[0][0]).toBe('ag-1');
  });

  it('encaixe=true exibe badge "encaixe"', () => {
    renderModal({ ...baseAg, encaixe: true });
    expect(screen.getByText(/encaixe/i)).toBeInTheDocument();
  });
});

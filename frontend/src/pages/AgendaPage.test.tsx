/**
 * AgendaPage — listagem + ações
 *
 * Cobre:
 *  - loading state
 *  - empty state
 *  - renderiza tabela com paciente + profissional
 *  - badge "encaixe" quando encaixe=true
 *  - botão Confirmar para SOLICITADO chama alterarStatus
 *  - botão Cancelar usa window.prompt + alterarStatus
 *  - botão Chamar para AGUARDANDO chama chamarAgendamento
 *  - botão Atendido para EM_ATENDIMENTO chama marcarAtendido
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AgendaPage from './AgendaPage';
import * as agendaApi from '../api/agenda';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AgendaPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  // Default agora é SEMANA — força vista "Dia" para os testes de tabela
  const tabDia = screen.getByRole('button', { name: /^dia$/i });
  fireEvent.click(tabDia);
  return result;
}

const baseAg = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  pacienteId: 'p1',
  profissionalId: 'pr1',
  dataHoraInicio: '2026-05-17T13:00:00.000Z',
  dataHoraFim: '2026-05-17T13:30:00.000Z',
  tipo: 'CONSULTA' as const,
  status: 'SOLICITADO' as const,
  origem: 'RECEPCAO' as const,
  encaixe: false,
  paciente: { id: 'p1', nomeCompleto: 'Paciente Alpha' },
  profissional: {
    id: 'pr1',
    nomeCompleto: 'Dr. Beta',
    cor: '#0f766e',
  },
};

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agendaApi, 'listProfissionais').mockResolvedValue([]);
  });

  it('exibe loading state', () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('empty state quando lista vazia', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/nenhum agendamento/i, {}, { timeout: 3000 });
  });

  it('renderiza paciente e profissional', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([baseAg]);
    renderPage();

    await screen.findByText('Paciente Alpha', {}, { timeout: 3000 });
    expect(screen.getByText('Dr. Beta')).toBeInTheDocument();
    expect(screen.getByText('SOLICITADO')).toBeInTheDocument();
  });

  it('exibe badge "encaixe" quando encaixe=true', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([
      { ...baseAg, encaixe: true },
    ]);
    renderPage();

    await screen.findByText(/encaixe/i, {}, { timeout: 3000 });
  });

  it('botão Confirmar em SOLICITADO chama alterarStatus(CONFIRMADO)', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([baseAg]);
    const alterarMock = vi
      .spyOn(agendaApi, 'alterarStatus')
      .mockResolvedValue({} as Awaited<ReturnType<typeof agendaApi.alterarStatus>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /confirmar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(alterarMock).toHaveBeenCalledWith(baseAg.id, 'CONFIRMADO', undefined);
    });
  });

  it('botão Cancelar usa window.prompt + alterarStatus(CANCELADO)', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([baseAg]);
    vi.spyOn(window, 'prompt').mockReturnValue('Paciente desistiu');
    const alterarMock = vi
      .spyOn(agendaApi, 'alterarStatus')
      .mockResolvedValue({} as Awaited<ReturnType<typeof agendaApi.alterarStatus>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /cancelar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(alterarMock).toHaveBeenCalledWith(
        baseAg.id,
        'CANCELADO',
        'Paciente desistiu',
      );
    });
  });

  it('botão Chamar em AGUARDANDO chama chamarAgendamento', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([
      { ...baseAg, status: 'AGUARDANDO' as const },
    ]);
    const chamarMock = vi
      .spyOn(agendaApi, 'chamarAgendamento')
      .mockResolvedValue({} as Awaited<ReturnType<typeof agendaApi.chamarAgendamento>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /chamar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(chamarMock).toHaveBeenCalledWith(baseAg.id);
    });
  });

  it('botão Atendido em EM_ATENDIMENTO chama marcarAgendamentoAtendido', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([
      { ...baseAg, status: 'EM_ATENDIMENTO' as const },
    ]);
    const atendidoMock = vi
      .spyOn(agendaApi, 'marcarAgendamentoAtendido')
      .mockResolvedValue({} as Awaited<ReturnType<typeof agendaApi.marcarAgendamentoAtendido>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /atendido/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(atendidoMock).toHaveBeenCalledWith(baseAg.id);
    });
  });

  it('botão "+ Novo agendamento" link para /agenda/novo', async () => {
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([]);
    renderPage();

    const link = await screen.findByRole('link', { name: /novo agendamento/i });
    expect(link).toHaveAttribute('href', '/agenda/novo');
  });
});

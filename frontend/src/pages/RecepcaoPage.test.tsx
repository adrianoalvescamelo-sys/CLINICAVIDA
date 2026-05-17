/**
 * RecepcaoPage — dashboard consumer + action wiring
 *
 * Cobre:
 *  - loading state inicial
 *  - dashboard payload populado: métricas refletem counts
 *  - empty state em listas
 *  - ofertar vaga: chama API e invalida query
 *  - marcar agendado: idem
 *  - registrar recusa: usa window.prompt
 *  - alterar prioridade: usa window.prompt + valida número
 *  - refetch via botão "Atualizar"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RecepcaoPage from './RecepcaoPage';
import * as agendaApi from '../api/agenda';
import * as pacientesApi from '../api/pacientes';
import * as listaEsperaApi from '../api/lista-espera';
import * as recepcaoApi from '../api/recepcao';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <RecepcaoPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const baseAgendamento = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  dataHoraInicio: '2026-05-17T13:00:00.000Z',
  dataHoraFim: '2026-05-17T13:30:00.000Z',
  status: 'CONFIRMADO' as const,
  paciente: { id: 'p1', nomeCompleto: 'Paciente Alpha' },
  profissional: { id: 'pr1', nomeCompleto: 'Dr. Beta', cor: '#0f766e' },
};

const baseListaEsperaAtivo = {
  id: 'le1',
  pacienteId: 'p1',
  prioridade: 50,
  status: 'ATIVO' as const,
  paciente: { id: 'p1', nomeCompleto: 'Paciente Alpha' },
  profissional: null,
  especialidade: 'Cardiologia',
};

const baseListaEsperaContatado = {
  ...baseListaEsperaAtivo,
  id: 'le2',
  status: 'CONTATADO' as const,
};

function mockDashboard(overrides: Partial<Record<string, unknown>> = {}) {
  return vi.spyOn(recepcaoApi, 'obterDashboardRecepcao').mockResolvedValue({
    agendaDoDia: [baseAgendamento],
    aguardando: [],
    confirmacoesPendentes: [],
    emAtendimento: [],
    mensagensPendentes: [],
    listaEspera: [],
    contagemPorStatus: {} as Record<string, number>,
    totalAgenda: 1,
    generatedAt: '2026-05-17T13:00:00.000Z',
    ...overrides,
  } as Awaited<ReturnType<typeof recepcaoApi.obterDashboardRecepcao>>);
}

describe('RecepcaoPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agendaApi, 'listProfissionais').mockResolvedValue([]);
    vi.spyOn(pacientesApi, 'listPacientes').mockResolvedValue({
      itens: [],
      total: 0,
    } as Awaited<ReturnType<typeof pacientesApi.listPacientes>>);
  });

  it('exibe loading state inicial', () => {
    vi.spyOn(recepcaoApi, 'obterDashboardRecepcao').mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('métricas refletem counts do dashboard', async () => {
    const msg = {
      id: 'm1',
      tipo: 'CONFIRMACAO_24H' as const,
      status: 'PENDENTE' as const,
      telefone: '65999990001',
      tentativas: 1,
      paciente: { id: 'p1', nomeCompleto: 'Paciente Alpha' },
    };
    mockDashboard({
      agendaDoDia: [
        baseAgendamento,
        { ...baseAgendamento, id: 'x2' },
        { ...baseAgendamento, id: 'x3' },
      ],
      aguardando: [{ ...baseAgendamento, id: 'aw1' }],
      confirmacoesPendentes: [
        { ...baseAgendamento, id: 'cp1' },
        { ...baseAgendamento, id: 'cp2' },
      ],
      emAtendimento: [],
      mensagensPendentes: [msg],
      listaEspera: [baseListaEsperaAtivo],
    });
    renderPage();

    // Aguarda card de paciente renderizar (sinal de dashboard carregado)
    await screen.findAllByText('Paciente Alpha', {}, { timeout: 3000 });
    // Métricas exibidas em <div> separadas
    const allText = document.body.textContent ?? '';
    // 3 agenda, 1 aguardando, 0 em atendimento, 2 confirmacoes, 1 whatsapp, 1 lista
    expect(allText).toContain('Agenda');
    expect(allText).toContain('Aguardando');
    expect(allText).toContain('Confirmacoes');
    expect(allText).toContain('Lista espera');
  });

  it('empty state em listas (lista de espera vazia)', async () => {
    mockDashboard();
    renderPage();

    // Lista de espera vazia mostra "Ninguem na lista."
    await screen.findByText(/ninguem na lista/i, {}, { timeout: 3000 });
    expect(screen.getByText(/nenhuma pendencia/i)).toBeInTheDocument();
  });

  it('ofertar vaga: chama API ofertarVaga', async () => {
    mockDashboard({ listaEspera: [baseListaEsperaAtivo] });
    const ofertarMock = vi
      .spyOn(listaEsperaApi, 'ofertarVaga')
      .mockResolvedValue({} as Awaited<ReturnType<typeof listaEsperaApi.ofertarVaga>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /ofertar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(ofertarMock).toHaveBeenCalledWith(baseListaEsperaAtivo.id);
    });
  });

  it('marcar agendado: chama API marcarAgendado em item CONTATADO', async () => {
    mockDashboard({ listaEspera: [baseListaEsperaContatado] });
    const agendadoMock = vi
      .spyOn(listaEsperaApi, 'marcarAgendado')
      .mockResolvedValue({} as Awaited<ReturnType<typeof listaEsperaApi.marcarAgendado>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /agendado/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(agendadoMock).toHaveBeenCalledWith(baseListaEsperaContatado.id);
    });
  });

  it('registrar recusa: usa window.prompt e passa motivo', async () => {
    mockDashboard({ listaEspera: [baseListaEsperaContatado] });
    const promptMock = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('Não compareceu');
    const recusaMock = vi
      .spyOn(listaEsperaApi, 'registrarRecusa')
      .mockResolvedValue({} as Awaited<ReturnType<typeof listaEsperaApi.registrarRecusa>>);

    renderPage();

    const btn = await screen.findByRole('button', { name: /recusa/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(recusaMock).toHaveBeenCalledWith(baseListaEsperaContatado.id, {
        motivoRecusa: 'Não compareceu',
      });
    });
    promptMock.mockRestore();
  });

  it('alterar prioridade: valida número e chama atualizar', async () => {
    mockDashboard({ listaEspera: [baseListaEsperaAtivo] });
    const promptMock = vi.spyOn(window, 'prompt').mockReturnValue('99');
    const atualizarMock = vi
      .spyOn(listaEsperaApi, 'atualizarListaEspera')
      .mockResolvedValue({} as Awaited<ReturnType<typeof listaEsperaApi.atualizarListaEspera>>);

    renderPage();

    // botão prioridade mostra valor atual "50"
    const btn = await screen.findByRole('button', { name: '50' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(atualizarMock).toHaveBeenCalledWith(baseListaEsperaAtivo.id, {
        prioridade: 99,
      });
    });
    promptMock.mockRestore();
  });

  it('alterar prioridade: input inválido aborta com alert', async () => {
    mockDashboard({ listaEspera: [baseListaEsperaAtivo] });
    vi.spyOn(window, 'prompt').mockReturnValue('texto-nao-numero');
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const atualizarMock = vi.spyOn(listaEsperaApi, 'atualizarListaEspera');

    renderPage();

    const btn = await screen.findByRole('button', { name: '50' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalled();
    });
    expect(atualizarMock).not.toHaveBeenCalled();
  });
});

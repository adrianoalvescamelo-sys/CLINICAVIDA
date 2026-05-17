/**
 * RelatoriosPage — tabs + filtros + RBAC + export
 *
 * Cobre:
 *  - tab default agenda-dia carrega getAgendaDia
 *  - switch para tab agendamentos-status carrega getAgendamentosStatus
 *  - tab "Pacientes cadastrados" oculta para MEDICO (RBAC)
 *  - botões export visíveis só para ADMIN
 *  - export XLSX/PDF chamam API com tipo + filtros
 *  - empty state agenda-dia
 *  - render tabela agenda-dia
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RelatoriosPage from './RelatoriosPage';
import * as relatoriosApi from '../api/relatorios';
import * as agendaApi from '../api/agenda';
import { useAuthStore, type AuthUser } from '../store/auth';

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <RelatoriosPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok-test',
    refreshToken: 'ref-test',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 't@x.com',
      nomeCompleto: 'Tester',
      perfil,
    },
  });
}

const baseAgItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  dataHoraInicio: '2026-05-17T13:00:00.000Z',
  dataHoraFim: '2026-05-17T13:30:00.000Z',
  tipo: 'CONSULTA' as const,
  status: 'CONFIRMADO' as const,
  origem: 'RECEPCAO' as const,
  paciente: { id: 'p1', nomeCompleto: 'Paciente Alpha' },
  profissional: { id: 'pr1', nomeCompleto: 'Dr. Beta' },
};

describe('RelatoriosPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agendaApi, 'listProfissionais').mockResolvedValue([]);
    setUser('ADMIN');
  });

  it('default tab agenda-dia: chama getAgendaDia', async () => {
    const agendaMock = vi
      .spyOn(relatoriosApi, 'getAgendaDia')
      .mockResolvedValue({
        agendamentos: [baseAgItem],
        total: 1,
        generatedAt: '2026-05-17T13:00:00.000Z',
      } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);

    renderPage();

    await screen.findByText('Paciente Alpha', {}, { timeout: 3000 });
    expect(agendaMock).toHaveBeenCalled();
  });

  it('switch para tab "Por status": chama getAgendamentosStatus', async () => {
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);
    const statusMock = vi
      .spyOn(relatoriosApi, 'getAgendamentosStatus')
      .mockResolvedValue({
        porStatus: {},
        total: 0,
        generatedAt: '2026-05-17T13:00:00.000Z',
      } as Awaited<ReturnType<typeof relatoriosApi.getAgendamentosStatus>>);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /por status/i }));

    await waitFor(() => {
      expect(statusMock).toHaveBeenCalled();
    });
  });

  it('tab "Pacientes cadastrados" oculta para MEDICO', async () => {
    setUser('MEDICO');
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);

    renderPage();

    await screen.findByRole('button', { name: /agenda do dia/i });
    expect(
      screen.queryByRole('button', { name: /pacientes cadastrados/i }),
    ).not.toBeInTheDocument();
  });

  it('botões export visíveis só para ADMIN', async () => {
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);

    renderPage();

    await screen.findByRole('button', { name: /exportar xlsx/i });
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument();
  });

  it('botões export ocultos para RECEPCAO', async () => {
    setUser('RECEPCAO');
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);

    renderPage();

    await screen.findByRole('button', { name: /agenda do dia/i });
    expect(
      screen.queryByRole('button', { name: /exportar xlsx/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /exportar pdf/i }),
    ).not.toBeInTheDocument();
  });

  it('exportar XLSX: chama exportXlsx com tipo + token', async () => {
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);
    const exportMock = vi
      .spyOn(relatoriosApi, 'exportXlsx')
      .mockImplementation(() => undefined);

    renderPage();

    const btn = await screen.findByRole('button', { name: /exportar xlsx/i });
    fireEvent.click(btn);

    expect(exportMock).toHaveBeenCalledWith(
      'agenda-dia',
      expect.objectContaining({ data: expect.any(String) }),
      'tok-test',
    );
  });

  it('exportar PDF: chama exportPdf', async () => {
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);
    const exportMock = vi
      .spyOn(relatoriosApi, 'exportPdf')
      .mockImplementation(() => undefined);

    renderPage();

    const btn = await screen.findByRole('button', { name: /exportar pdf/i });
    fireEvent.click(btn);

    expect(exportMock).toHaveBeenCalledWith(
      'agenda-dia',
      expect.objectContaining({ data: expect.any(String) }),
      'tok-test',
    );
  });

  it('empty state em agenda-dia', async () => {
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [],
      total: 0,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);

    renderPage();

    await screen.findByText(/nenhum agendamento no periodo/i, {}, { timeout: 3000 });
  });

  it('renderiza tabela agenda-dia com dados', async () => {
    vi.spyOn(relatoriosApi, 'getAgendaDia').mockResolvedValue({
      agendamentos: [baseAgItem],
      total: 1,
      generatedAt: '2026-05-17T13:00:00.000Z',
    } as Awaited<ReturnType<typeof relatoriosApi.getAgendaDia>>);

    renderPage();

    await screen.findByText('Paciente Alpha', {}, { timeout: 3000 });
    expect(screen.getByText('Dr. Beta')).toBeInTheDocument();
    expect(screen.getByText('CONSULTA')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMADO')).toBeInTheDocument();
  });
});
